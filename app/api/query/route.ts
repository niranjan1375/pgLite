import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";
import { registerQuery, unregisterQuery } from "@/lib/query-registry";
import { rateLimit } from "@/lib/rate-limit";
import {
    describeReadOnlyError,
    releaseAfterUserQuery,
    runUserQuery,
} from "@/lib/run-query";
import { isExplainableReadQuery } from "@/lib/sql-safety";

// Server-side row limit to prevent DoS and memory overflow
const MAX_ROWS = 10000;
const EXPLAIN_PREFIX = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ";
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const MIN_QUERY_TIMEOUT_MS = 1000;
const MAX_QUERY_TIMEOUT_MS = 300000;

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

export async function POST(req: NextRequest) {
    const limited = rateLimit(req, { scope: "query" });
    if (limited) {
        return limited;
    }

    let appliedQueryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS;

    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;
        const environment: string =
            body?.environment || getDefaultEnvironment();
        const readOnly: boolean = body?.readOnly || false;
        const explain: boolean = body?.explain === true;
        const queryId: string | undefined =
            typeof body?.queryId === "string" ? body.queryId : undefined;
        appliedQueryTimeoutMs = resolveQueryTimeoutMs(body?.timeoutMs);

        if (!query) {
            return NextResponse.json(
                { error: "Query cannot be empty." },
                { status: 400 },
            );
        }

        if (explain && !isExplainableReadQuery(query)) {
            return NextResponse.json(
                {
                    error: "EXPLAIN is currently limited to read-only SELECT, WITH, or VALUES queries.",
                },
                { status: 400 },
            );
        }

        // Create pool for this specific request
        const pool = getPool(environment, database);

        // Pin a single connection so (a) statement_timeout applies to the exact
        // connection running the query and (b) we can capture its backend PID
        // for cancellation via /api/cancel-query.
        const client: PoolClient = await pool.connect();
        try {
            if (queryId) {
                const pidResult = await client.query(
                    "SELECT pg_backend_pid() AS pid",
                );
                const pid = pidResult.rows[0]?.pid;
                if (typeof pid === "number") {
                    registerQuery(queryId, { pid, environment, database });
                }
            }

            // Set per-session timeout for this request.
            await client.query(
                "SELECT set_config('statement_timeout', $1, false)",
                [String(appliedQueryTimeoutMs)],
            );

            const start = Date.now();
            const finalQuery = explain ? `${EXPLAIN_PREFIX}${query}` : query;
            // EXPLAIN ANALYZE executes the statement, so it always runs read-only.
            const result = await runUserQuery(client, finalQuery, {
                readOnly: readOnly || explain,
            });
            const executionTime = Date.now() - start;

            if (explain) {
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
                            : executionTime,
                });
            }

            // Cap the result set to keep payload/render bounded. Truncate and
            // flag rather than rejecting, so the user still sees the first
            // MAX_ROWS rows.
            const truncated = result.rows.length > MAX_ROWS;
            const rows = truncated
                ? result.rows.slice(0, MAX_ROWS)
                : result.rows;
            // Statements without a result set (UPDATE/DELETE/INSERT without
            // RETURNING, DDL) report the rows they affected instead.
            const returnsRows = result.fields.length > 0;

            return NextResponse.json({
                rows,
                rowCount: returnsRows ? rows.length : (result.rowCount ?? 0),
                command: result.command,
                totalRows: result.rows.length,
                fields: result.fields.map((f) => f.name),
                fieldTypes: result.fields.map((f) => f.dataTypeID),
                truncated,
                executionTime,
            });
        } finally {
            if (queryId) {
                unregisterQuery(queryId);
            }
            await releaseAfterUserQuery(client);
        }
    } catch (err: unknown) {
        const readOnlyError = describeReadOnlyError(err);
        if (readOnlyError) {
            return NextResponse.json({ error: readOnlyError }, { status: 403 });
        }
        if (err instanceof Error) {
            const pgError = err as Error & { code?: string };
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
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
        return NextResponse.json(
            { error: "An unknown error occurred." },
            { status: 500 },
        );
    }
}
