import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

// Server-side row limit to prevent DoS and memory overflow
const MAX_ROWS = 10000;

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

    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;
        const environment: string =
            body?.environment || getDefaultEnvironment();
        const readOnly: boolean = body?.readOnly || false;

        if (!query) {
            return NextResponse.json(
                { error: "Query cannot be empty." },
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

        // Set query timeout to prevent runaway queries (30 seconds)
        await pool.query("SET statement_timeout = 30000");

        const start = Date.now();
        const result = await pool.query(query);
        const executionTime = Date.now() - start;

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
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        // Always clean up pool after query
        if (pool) {
            await pool.end();
        }
    }
}
