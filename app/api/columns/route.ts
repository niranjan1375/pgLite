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

        // Create pool for the specific database
        pool = createPool(environment, database);

        const result = await pool.query(`
      SELECT 
        t.table_schema,
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c 
        ON t.table_schema = c.table_schema 
        AND t.table_name = c.table_name
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.table_schema, t.table_name, c.ordinal_position;
    `);

        // Group columns by table
        const tableColumns: Record<
            string,
            Array<{
                name: string;
                type: string;
                nullable: string;
            }>
        > = {};

        result.rows.forEach((row) => {
            const tableKey = `${row.table_schema}.${row.table_name}`;
            if (!tableColumns[tableKey]) {
                tableColumns[tableKey] = [];
            }
            tableColumns[tableKey].push({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable,
            });
        });

        return NextResponse.json({ tableColumns });
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
