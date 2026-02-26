import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const database: string = body?.database;

        if (!database) {
            return NextResponse.json(
                { error: "Database name is required." },
                { status: 400 },
            );
        }

        // Create a temporary pool for the specific database
        const tempPool = new Pool({
            host: process.env.POSTGRES_HOST,
            port: Number(process.env.POSTGRES_PORT) || 5432,
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: database,
            ssl: {
                rejectUnauthorized: false,
            },
        });

        const result = await tempPool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);

        await tempPool.end();

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
    }
}
