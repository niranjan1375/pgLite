import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";

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
        const environment: string = body?.environment || "loadtest";
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

        const result = await pool.query(query);

        return NextResponse.json({
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
            fields: result.fields.map((f) => f.name),
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
