import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

// Server-side row limit to prevent DoS and memory overflow
const MAX_ROWS = 10000;
const EXPLAIN_PREFIX = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ";
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const MIN_QUERY_TIMEOUT_MS = 1000;
const MAX_QUERY_TIMEOUT_MS = 300000;

function isExplainableReadQuery(query: string): boolean {
    const normalized = query.trim().toUpperCase();
    return (
        normalized.startsWith("SELECT") ||
        normalized.startsWith("WITH") ||
        normalized.startsWith("VALUES")
    );
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

/**
 * Helper to detect if a query is write operation
 */
function isWriteQuery(query: string): boolean {
    const upperQuery = query.trim().toUpperCase();
    const writeKeywords = [
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "CREATE",
        "ALTER",
        "TRUNCATE",
        "REPLACE",
        "MERGE",
        "GRANT",
        "REVOKE",
    ];
    return writeKeywords.some((keyword) => upperQuery.startsWith(keyword));
}

export async function POST(req: NextRequest) {
    let pool = null;
    let appliedQueryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS;

    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;
        const environment: string =
            body?.environment || getDefaultEnvironment();
        const readOnly: boolean = body?.readOnly || false;
        const explain: boolean = body?.explain === true;
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

        // Check if read-only mode is enabled and query is a write operation
        if (readOnly && isWriteQuery(query)) {
            return NextResponse.json(
                {
                    error: "Write operations are disabled in read-only mode. Disable read-only protection to execute this query.",
                },
                { status: 403 },
            );
        }

        // Create pool for this specific request
        pool = createPool(environment, database);

        // Set per-session timeout for this request.
        await pool.query("SELECT set_config('statement_timeout', $1, false)", [
            String(appliedQueryTimeoutMs),
        ]);

        const start = Date.now();
        const finalQuery = explain ? `${EXPLAIN_PREFIX}${query}` : query;
        const result = await pool.query(finalQuery);
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

        // Enforce row limit to prevent DoS and memory overflow
        if (result.rows.length > MAX_ROWS) {
            return NextResponse.json(
                {
                    error: `Query returned ${result.rows.length.toLocaleString()} rows (limit: ${MAX_ROWS.toLocaleString()}). Please add a LIMIT clause to reduce the result set.`,
                    rowCount: result.rows.length,
                    truncated: true,
                },
                { status: 413 }, // Payload Too Large
            );
        }

        return NextResponse.json({
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
            fields: result.fields.map((f) => f.name),
            truncated: false,
            executionTime,
        });
    } catch (err: unknown) {
        if (err instanceof Error) {
            const pgError = err as Error & { code?: string };
            if (pgError.code === "57014") {
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
    } finally {
        // Always clean up pool after query
        if (pool) {
            await pool.end();
        }
    }
}
