import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

export const dynamic = "force-dynamic";

const WORKSPACE_SCHEMA_TTL_MS = 60_000;
const workspaceSchemaCache = new Map<
    string,
    { schemas: SchemaInfo[]; cachedAt: number }
>();
const EXCLUDED_DATABASES = new Set([
    "postgres",
    "template0",
    "template1",
    "rdsadmin",
]);

interface SchemaInfo {
    database: string;
    schemas: {
        schema: string;
        tables: {
            name: string;
            columns: {
                name: string;
                type: string;
                nullable: string;
            }[];
        }[];
    }[];
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const environment =
            searchParams.get("environment") || getDefaultEnvironment();
        const forceRefresh = searchParams.get("refresh") === "1";

        if (!forceRefresh) {
            const cached = workspaceSchemaCache.get(environment);
            const isFresh =
                cached &&
                Date.now() - cached.cachedAt < WORKSPACE_SCHEMA_TTL_MS;

            if (isFresh) {
                return NextResponse.json(
                    { schemas: cached.schemas, cached: true },
                    {
                        headers: {
                            "Cache-Control":
                                "public, s-maxage=60, stale-while-revalidate=300",
                        },
                    },
                );
            }
        }

        // First, get all databases
        const dbPool = createPool(environment, "postgres");
        const dbResult = await dbPool.query(`
            SELECT datname 
            FROM pg_database 
            WHERE datistemplate = false
              AND datallowconn = true
            ORDER BY datname;
        `);
        await dbPool.end();

        const databases = dbResult.rows
            .map((row) => row.datname)
            .filter((name) => !EXCLUDED_DATABASES.has(name));
        const allSchemas: SchemaInfo[] = [];
        const skippedDatabases: string[] = [];

        // For each database, fetch schemas and tables
        for (const dbName of databases) {
            let pool: ReturnType<typeof createPool> | undefined;

            try {
                pool = createPool(environment, dbName);

                // Get all schemas and tables
                const schemaResult = await pool.query(`
                    SELECT 
                        n.nspname as schema_name,
                        c.relname as table_name
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relkind = 'r'
                    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY n.nspname, c.relname;
                `);

                // Group by schema
                const schemaMap: Record<string, Set<string>> = {};
                for (const row of schemaResult.rows) {
                    if (!schemaMap[row.schema_name]) {
                        schemaMap[row.schema_name] = new Set();
                    }
                    schemaMap[row.schema_name].add(row.table_name);
                }

                // Build schema structure
                const schemas = [];
                for (const [schemaName, tableSet] of Object.entries(
                    schemaMap,
                )) {
                    const tables = [];

                    for (const tableName of Array.from(tableSet)) {
                        // Get columns for each table
                        const columnResult = await pool.query(
                            `SELECT 
                                column_name as name,
                                data_type as type,
                                is_nullable as nullable
                            FROM information_schema.columns
                            WHERE table_schema = $1 AND table_name = $2
                            ORDER BY ordinal_position;`,
                            [schemaName, tableName],
                        );

                        tables.push({
                            name: tableName,
                            columns: columnResult.rows,
                        });
                    }

                    schemas.push({
                        schema: schemaName,
                        tables,
                    });
                }

                allSchemas.push({
                    database: dbName,
                    schemas,
                });
            } catch {
                skippedDatabases.push(dbName);
            } finally {
                if (pool) {
                    await pool.end();
                }
            }
        }

        workspaceSchemaCache.set(environment, {
            schemas: allSchemas,
            cachedAt: Date.now(),
        });

        return NextResponse.json(
            { schemas: allSchemas, cached: false, skippedDatabases },
            {
                headers: {
                    "Cache-Control":
                        "public, s-maxage=60, stale-while-revalidate=300",
                },
            },
        );
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
