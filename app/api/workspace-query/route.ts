import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { applyVariables, validateVariables } from "@/lib/templates";
import { registerQuery, unregisterQuery } from "@/lib/query-registry";
import { rateLimit } from "@/lib/rate-limit";
import {
    describeReadOnlyError,
    releaseAfterUserQuery,
    runUserQuery,
} from "@/lib/run-query";
import {
    isExplainableReadQuery,
    replaceInCode,
    scanStatements,
} from "@/lib/sql-safety";

export const dynamic = "force-dynamic";
const MAX_ROWS = 10000;
const EXPLAIN_PREFIX = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ";
const DEFAULT_QUERY_TIMEOUT_MS = 120000;
const MIN_QUERY_TIMEOUT_MS = 1000;
const MAX_QUERY_TIMEOUT_MS = 300000;

const VARIABLE_USAGE_REGEX = /(?<!\w)@([A-Za-z_][A-Za-z0-9_]*)\b/g;
const TEXT_NUMERIC_OPERATOR_MISMATCH_REGEX =
    /operator does not exist:\s*(?:character varying|text)\s*=\s*(?:smallint|integer|bigint|numeric|real|double precision)/i;

function isNumericVariableValue(value: string): boolean {
    const trimmed = value.trim();
    return (
        /^-?\d+(?:\.\d+)?$/.test(trimmed) ||
        /^-?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(trimmed)
    );
}

function formatWorkspaceQueryError(
    error: Error,
    variables: Record<string, string>,
): string {
    if (!TEXT_NUMERIC_OPERATOR_MISMATCH_REGEX.test(error.message)) {
        return error.message;
    }

    const numericVariables = Object.entries(variables)
        .filter(([, value]) => isNumericVariableValue(value))
        .map(([name]) => `@${name}`);

    if (numericVariables.length === 0) {
        return error.message;
    }

    return `${error.message}. Numeric-looking variables are inserted without quotes in workspace mode. If the column is text, define the variable with quotes, for example @mobileNumber = '9705695237'. Affected variables: ${numericVariables.join(", ")}.`;
}

function getReferencedVariables(sql: string): Set<string> {
    const usedVariables = new Set<string>();
    for (const match of sql.matchAll(VARIABLE_USAGE_REGEX)) {
        usedVariables.add(match[1]);
    }
    return usedVariables;
}

function resolveQueryTimeoutMs(timeoutMs: unknown): number {
    if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
        return DEFAULT_QUERY_TIMEOUT_MS;
    }

    const normalized = Math.floor(timeoutMs);
    return Math.min(
        MAX_QUERY_TIMEOUT_MS,
        Math.max(MIN_QUERY_TIMEOUT_MS, normalized),
    );
}

// Extract database names from SQL query using table prefix syntax (db_name.table_name)
function extractDatabasePrefixes(sql: string): string[] {
    const databases = new Set<string>();

    // Match patterns like: FROM db.table, JOIN db.table, etc.
    // Supports: db.table or db.schema.table
    const pattern =
        /(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)\./gi;

    let match;
    // Reset lastIndex for each search
    pattern.lastIndex = 0;

    while ((match = pattern.exec(sql)) !== null) {
        databases.add(match[1]);
    }

    return Array.from(databases);
}

// Remove database prefix from SQL query (db.table -> table)
// PostgreSQL doesn't support cross-database queries, so we strip the DB prefix
// after routing to the correct database. Only code is rewritten: string
// literals and comments keep their text (e.g. 'see core.users').
function stripDatabasePrefix(sql: string, dbName: string): string {
    const escapedDbName = dbName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedDbName}\\.`, "gi");
    return replaceInCode(sql, regex, "");
}

export async function POST(request: NextRequest) {
    const limited = rateLimit(request, { scope: "query" });
    if (limited) {
        return limited;
    }

    let requestVariables: Record<string, string> = {};
    let appliedQueryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS;

    try {
        const body = await request.json();
        const { sql, variables, environment, explain, timeoutMs } = body;
        const readOnly: boolean = body?.readOnly || false;
        const queryId: string | undefined =
            typeof body?.queryId === "string" ? body.queryId : undefined;
        appliedQueryTimeoutMs = resolveQueryTimeoutMs(timeoutMs);

        // Validate required fields
        if (!sql || typeof sql !== "string") {
            return NextResponse.json(
                { error: "SQL is required" },
                { status: 400 },
            );
        }

        if (!environment || typeof environment !== "string") {
            return NextResponse.json(
                { error: "Environment is required" },
                { status: 400 },
            );
        }

        if (explain === true && !isExplainableReadQuery(sql)) {
            return NextResponse.json(
                {
                    error: "EXPLAIN is currently limited to read-only SELECT, WITH, or VALUES queries.",
                },
                { status: 400 },
            );
        }

        // Validate variables if provided
        if (variables && typeof variables !== "object") {
            return NextResponse.json(
                { error: "Variables must be an object" },
                { status: 400 },
            );
        }

        let cleanedSql = sql.trim();

        const providedVariables: Record<string, string> =
            variables && typeof variables === "object" ? variables : {};
        requestVariables = providedVariables;

        const referencedVariables = getReferencedVariables(cleanedSql);
        const missingVariables = [...referencedVariables].filter(
            (name) =>
                !Object.prototype.hasOwnProperty.call(providedVariables, name),
        );

        if (missingVariables.length > 0) {
            return NextResponse.json(
                {
                    error: `SQL references undefined variables: ${missingVariables
                        .map((name) => `@${name}`)
                        .join(", ")}`,
                },
                { status: 400 },
            );
        }

        // Apply variables if provided
        if (Object.keys(providedVariables).length > 0) {
            try {
                validateVariables(providedVariables, cleanedSql);
                cleanedSql = applyVariables(cleanedSql, providedVariables);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Variable validation failed.";
                return NextResponse.json({ error: message }, { status: 400 });
            }
        }

        if (!cleanedSql) {
            return NextResponse.json(
                { error: "SQL is empty after variable processing." },
                { status: 400 },
            );
        }

        // Extract database prefixes from code only, so a "db.table" inside a
        // comment or string literal can't change routing.
        const dbPrefixes = extractDatabasePrefixes(
            scanStatements(cleanedSql)
                .map((statement) => statement.code)
                .join(";\n"),
        );

        // Validation: Require exactly one database prefix
        if (dbPrefixes.length === 0) {
            return NextResponse.json(
                {
                    error: "Workspace mode requires table prefix syntax (db_name.table_name). No database prefix found in query.",
                },
                { status: 400 },
            );
        }

        if (dbPrefixes.length > 1) {
            return NextResponse.json(
                {
                    error: `Workspace mode supports only one database per query. Found multiple: ${dbPrefixes.join(", ")}. Cross-database joins are not supported.`,
                },
                { status: 400 },
            );
        }

        const routedDatabase = dbPrefixes[0];

        // Connect directly to the routed database. We deliberately do NOT run a
        // separate existence check against the "postgres" database: that DB is
        // not reachable in every environment (managed instances often restrict
        // it), which made valid queries fail with a 5s connection timeout even
        // when the target DB was fine. A non-existent database surfaces as
        // SQLSTATE 3D000 on connect, which we translate to a friendly message.
        const pool = getPool(environment, routedDatabase);

        let client: PoolClient;
        try {
            client = await pool.connect();
        } catch (connectError) {
            const code = (connectError as { code?: string })?.code;
            if (code === "3D000") {
                return NextResponse.json(
                    {
                        error: `Database "${routedDatabase}" does not exist. If you're using schema-qualified tables (e.g., "schema.table"), use a standard tab instead. Workspace mode is only for routing to different databases.`,
                    },
                    { status: 400 },
                );
            }
            throw connectError;
        }

        try {
            if (queryId) {
                const pidResult = await client.query(
                    "SELECT pg_backend_pid() AS pid",
                );
                const pid = pidResult.rows[0]?.pid;
                if (typeof pid === "number") {
                    registerQuery(queryId, {
                        pid,
                        environment,
                        database: routedDatabase,
                    });
                }
            }

            // Set per-session timeout for this request.
            await client.query(
                "SELECT set_config('statement_timeout', $1, false)",
                [String(appliedQueryTimeoutMs)],
            );

            // Strip database prefix from query since PostgreSQL doesn't support cross-DB queries
            // After routing to the correct DB, we need to remove "db_name." from table references
            const strippedQuery = stripDatabasePrefix(
                cleanedSql,
                routedDatabase,
            );

            const finalQuery =
                explain === true
                    ? `${EXPLAIN_PREFIX}${strippedQuery}`
                    : strippedQuery;
            // EXPLAIN ANALYZE executes the statement, so it always runs read-only.
            const result = await runUserQuery(client, finalQuery, {
                readOnly: readOnly || explain === true,
            });

            if (explain === true) {
                const explainJson = result.rows[0]?.["QUERY PLAN"];
                const planRoot = Array.isArray(explainJson)
                    ? explainJson[0]
                    : explainJson;

                return NextResponse.json({
                    isExplain: true,
                    explain: planRoot,
                    executionTime:
                        typeof planRoot?.["Execution Time"] === "number"
                            ? Math.round(planRoot["Execution Time"])
                            : undefined,
                    routedDatabase,
                });
            }

            // Check if this is a data-returning query
            if (result.fields.length > 0) {
                // Cap the result set, but truncate-and-flag rather than reject
                // so the user still sees the first MAX_ROWS rows.
                const truncated = result.rows.length > MAX_ROWS;
                const rows = truncated
                    ? result.rows.slice(0, MAX_ROWS)
                    : result.rows;

                return NextResponse.json({
                    rows,
                    rowCount: rows.length,
                    command: result.command,
                    totalRows: result.rows.length,
                    fields: result.fields.map((f) => f.name),
                    fieldTypes: result.fields.map((f) => f.dataTypeID),
                    truncated,
                    routedDatabase,
                });
            }

            // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
            return NextResponse.json({
                rows: [],
                rowCount: result.rowCount ?? 0,
                command: result.command,
                fields: [],
                routedDatabase,
            });
        } finally {
            if (queryId) {
                unregisterQuery(queryId);
            }
            await releaseAfterUserQuery(client);
        }
    } catch (error: unknown) {
        console.error("Workspace query error:", error);

        const readOnlyError = describeReadOnlyError(error);
        if (readOnlyError) {
            return NextResponse.json({ error: readOnlyError }, { status: 403 });
        }

        if (error instanceof Error) {
            const pgError = error as Error & { code?: string };
            if (pgError.code === "57014") {
                // 57014 covers both statement_timeout and pg_cancel_backend.
                // Distinguish by message so a user cancel isn't mislabeled.
                if (/user request/i.test(pgError.message)) {
                    return NextResponse.json(
                        { error: "Query cancelled." },
                        { status: 499 },
                    );
                }
                const timeoutSeconds = Math.max(
                    1,
                    Math.round(appliedQueryTimeoutMs / 1000),
                );
                return NextResponse.json(
                    {
                        error: `Query timed out after ${timeoutSeconds} seconds. Add a LIMIT clause or refine your query to reduce the result set.`,
                    },
                    { status: 408 },
                );
            }
            return NextResponse.json(
                {
                    error: formatWorkspaceQueryError(error, requestVariables),
                },
                { status: 500 },
            );
        }

        return NextResponse.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}
