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
            primaryKeys?: string[];
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

                const schemaResult = await pool.query(`
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
                        c.table_schema AS schema_name,
                        c.table_name,
                        c.column_name AS name,
                        c.data_type AS type,
                        c.is_nullable AS nullable,
                        COALESCE(pk.primary_keys, ARRAY[]::text[]) AS primary_keys
                    FROM information_schema.columns c
                    JOIN information_schema.tables t
                      ON c.table_schema = t.table_schema
                     AND c.table_name = t.table_name
                    LEFT JOIN primary_keys pk
                      ON c.table_schema = pk.table_schema
                     AND c.table_name = pk.table_name
                    WHERE t.table_type = 'BASE TABLE'
                      AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
                `);

                const schemaMap = new Map<
                    string,
                    Map<
                        string,
                        {
                            name: string;
                            primaryKeys: string[];
                            columns: {
                                name: string;
                                type: string;
                                nullable: string;
                            }[];
                        }
                    >
                >();

                for (const row of schemaResult.rows) {
                    if (!schemaMap.has(row.schema_name)) {
                        schemaMap.set(row.schema_name, new Map());
                    }

                    const tablesForSchema = schemaMap.get(row.schema_name)!;
                    if (!tablesForSchema.has(row.table_name)) {
                        tablesForSchema.set(row.table_name, {
                            name: row.table_name,
                            primaryKeys: row.primary_keys || [],
                            columns: [],
                        });
                    }

                    tablesForSchema.get(row.table_name)!.columns.push({
                        name: row.name,
                        type: row.type,
                        nullable: row.nullable,
                    });
                }

                const schemas = Array.from(schemaMap.entries()).map(
                    ([schemaName, tableMap]) => ({
                        schema: schemaName,
                        tables: Array.from(tableMap.values()),
                    }),
                );

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
