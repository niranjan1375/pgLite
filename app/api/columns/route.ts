import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";
import { cachedSchema, schemaCacheKey } from "@/lib/schema-cache";

type TableColumns = Record<
    string,
    Array<{ name: string; type: string; nullable: string }>
>;

export async function POST(req: NextRequest) {
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

        const { data, cachedAt, stale } = await cachedSchema(
            schemaCacheKey("columns", environment, database),
            () => loadColumns(environment, database),
            { force: forceRefresh },
        );
        return NextResponse.json({ ...data, cachedAt, stale });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function loadColumns(environment: string, database: string) {
    // Create pool for the specific database
    const pool = getPool(environment, database);

    const result = await pool.query(`
        WITH primary_keys AS (
            SELECT
                kcu.table_schema,
                kcu.table_name,
                array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS primary_keys
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
             AND tc.table_name = kcu.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY'
            GROUP BY kcu.table_schema, kcu.table_name
        )
        SELECT 
            t.table_schema,
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            COALESCE(pk.primary_keys, ARRAY[]::text[]) AS primary_keys
        FROM information_schema.tables t
        JOIN information_schema.columns c 
            ON t.table_schema = c.table_schema 
            AND t.table_name = c.table_name
        LEFT JOIN primary_keys pk
            ON t.table_schema = pk.table_schema
         AND t.table_name = pk.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY t.table_schema, t.table_name, c.ordinal_position;
    `);

    // Group columns by table
    const tableColumns: TableColumns = {};
    const primaryKeysByTable: Record<string, string[]> = {};

    result.rows.forEach((row) => {
        const tableKey = `${row.table_schema}.${row.table_name}`;
        if (!tableColumns[tableKey]) {
            tableColumns[tableKey] = [];
        }
        if (!primaryKeysByTable[tableKey]) {
            primaryKeysByTable[tableKey] = row.primary_keys || [];
        }
        tableColumns[tableKey].push({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable,
        });
    });

    return { tableColumns, primaryKeysByTable };
}
