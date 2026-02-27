import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getPool } from "@/lib/db";
import { environments } from "@/lib/environments";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;
        const environment: string = body?.environment || "loadtest";

        if (!query) {
            return NextResponse.json(
                { error: "Query cannot be empty." },
                { status: 400 },
            );
        }

        // Use a specific database if provided, otherwise use default pool
        let client = getPool(environment);
        let tempPool: Pool | null = null;

        const envConfig = environments[environment] || environments.loadtest;

        if (database && database !== envConfig.database) {
            tempPool = new Pool({
                host: envConfig.host,
                port: envConfig.port,
                user: envConfig.user,
                password: envConfig.password,
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
