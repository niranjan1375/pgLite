import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

const TABLES_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const tablesCache = new Map<
    string,
    { tables: Array<{ schema: string; name: string }>; cachedAt: number }
>();

export async function POST(req: NextRequest) {
    let pool = null;

    try {
        const body = await req.json();
        const database: string = body?.database;
        const environment: string =
            body?.environment || getDefaultEnvironment();
        const forceRefresh: boolean = body?.forceRefresh === true;

        if (!database) {
            return NextResponse.json(
                { error: "Database name is required." },
                { status: 400 },
            );
        }

        const cacheKey = `${environment}:${database}`;
        if (!forceRefresh) {
            const cached = tablesCache.get(cacheKey);
            if (cached && Date.now() - cached.cachedAt < TABLES_CACHE_TTL_MS) {
                return NextResponse.json({
                    tables: cached.tables,
                    cached: true,
                });
            }
        }

        // Create pool using environment system for consistency
        pool = createPool(environment, database);

        const result = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);

        const tables = result.rows.map((row) => ({
            schema: row.table_schema,
            name: row.table_name,
        }));
        tablesCache.set(cacheKey, { tables, cachedAt: Date.now() });

        return NextResponse.json({ tables });
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
