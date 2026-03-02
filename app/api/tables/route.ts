import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";

export async function POST(req: NextRequest) {
    let pool = null;

    try {
        const body = await req.json();
        const database: string = body?.database;
        const environment: string = body?.environment || "loadtest";

        if (!database) {
            return NextResponse.json(
                { error: "Database name is required." },
                { status: 400 },
            );
        }

        // Create pool using environment system for consistency
        pool = createPool(environment, database);

        const result = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);

        return NextResponse.json({
            tables: result.rows.map((row) => ({
                schema: row.table_schema,
                name: row.table_name,
            })),
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}
