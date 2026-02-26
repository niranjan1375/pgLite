import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;

        if (!query) {
            return NextResponse.json(
                { error: "Query cannot be empty." },
                { status: 400 },
            );
        }

        // Use a specific database if provided, otherwise use default pool
        let client = pool;
        let tempPool: Pool | null = null;

        if (database && database !== process.env.POSTGRES_DB) {
            tempPool = new Pool({
                host: process.env.POSTGRES_HOST,
                port: Number(process.env.POSTGRES_PORT) || 5432,
                user: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                database: database,
                ssl: {
                    rejectUnauthorized: false,
                },
            });
            client = tempPool;
        }

        const result = await client.query(query);

        if (tempPool) {
            await tempPool.end();
        }

        return NextResponse.json({
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
            fields: result.fields.map((f) => f.name),
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
