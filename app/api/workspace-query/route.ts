import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { applyVariables, validateVariables } from "@/lib/templates";

export const dynamic = "force-dynamic";

const VARIABLE_USAGE_REGEX = /(?<!\w)@([A-Za-z_][A-Za-z0-9_]*)\b/g;

function getReferencedVariables(sql: string): Set<string> {
    const usedVariables = new Set<string>();
    for (const match of sql.matchAll(VARIABLE_USAGE_REGEX)) {
        usedVariables.add(match[1]);
    }
    return usedVariables;
}

// Extract database names from SQL query using table prefix syntax (db_name.table_name)
function extractDatabasePrefixes(sql: string): string[] {
    const databases = new Set<string>();

    // Match patterns like: FROM db.table, JOIN db.table, etc.
    // Supports: db.table or db.schema.table
    const pattern =
        /(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)\./gi;

    let match;
    // Reset lastIndex for each search
    pattern.lastIndex = 0;

    while ((match = pattern.exec(sql)) !== null) {
        databases.add(match[1]);
    }

    return Array.from(databases);
}

// Remove database prefix from SQL query (db.table -> table)
// PostgreSQL doesn't support cross-database queries, so we strip the DB prefix
// after routing to the correct database
function stripDatabasePrefix(sql: string, dbName: string): string {
    // Replace db_name. with nothing (case-insensitive)
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${dbName}\\.`, "gi");
    return sql.replace(regex, "");
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sql, variables, environment } = body;

        // Validate required fields
        if (!sql || typeof sql !== "string") {
            return NextResponse.json(
                { error: "SQL is required" },
                { status: 400 },
            );
        }

        if (!environment || typeof environment !== "string") {
            return NextResponse.json(
                { error: "Environment is required" },
                { status: 400 },
            );
        }

        // Validate variables if provided
        if (variables && typeof variables !== "object") {
            return NextResponse.json(
                { error: "Variables must be an object" },
                { status: 400 },
            );
        }

        let cleanedSql = sql.trim();

        const providedVariables: Record<string, string> =
            variables && typeof variables === "object" ? variables : {};

        const referencedVariables = getReferencedVariables(cleanedSql);
        const missingVariables = [...referencedVariables].filter(
            (name) =>
                !Object.prototype.hasOwnProperty.call(providedVariables, name),
        );

        if (missingVariables.length > 0) {
            return NextResponse.json(
                {
                    error: `SQL references undefined variables: ${missingVariables
                        .map((name) => `@${name}`)
                        .join(", ")}`,
                },
                { status: 400 },
            );
        }

        // Apply variables if provided
        if (Object.keys(providedVariables).length > 0) {
            try {
                validateVariables(providedVariables, cleanedSql);
                cleanedSql = applyVariables(cleanedSql, providedVariables);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Variable validation failed.";
                return NextResponse.json({ error: message }, { status: 400 });
            }
        }

        if (!cleanedSql) {
            return NextResponse.json(
                { error: "SQL is empty after variable processing." },
                { status: 400 },
            );
        }

        // Extract database prefixes from query
        const dbPrefixes = extractDatabasePrefixes(cleanedSql);

        // Validation: Require exactly one database prefix
        if (dbPrefixes.length === 0) {
            return NextResponse.json(
                {
                    error: "Workspace mode requires table prefix syntax (db_name.table_name). No database prefix found in query.",
                },
                { status: 400 },
            );
        }

        if (dbPrefixes.length > 1) {
            return NextResponse.json(
                {
                    error: `Workspace mode supports only one database per query. Found multiple: ${dbPrefixes.join(", ")}. Cross-database joins are not supported.`,
                },
                { status: 400 },
            );
        }

        const routedDatabase = dbPrefixes[0];

        // Verify the detected database actually exists
        const tempPool = createPool(environment, "postgres"); // Connect to default DB to check
        try {
            const dbCheckResult = await tempPool.query(
                "SELECT datname FROM pg_database WHERE datname = $1 AND datistemplate = false",
                [routedDatabase],
            );

            if (dbCheckResult.rows.length === 0) {
                return NextResponse.json(
                    {
                        error: `Database "${routedDatabase}" does not exist. If you're using schema-qualified tables (e.g., "schema.table"), use a standard tab instead. Workspace mode is only for routing to different databases.`,
                    },
                    { status: 400 },
                );
            }
        } finally {
            await tempPool.end();
        }

        // Create connection pool for the detected database
        const pool = await createPool(environment, routedDatabase);

        if (!pool) {
            return NextResponse.json(
                { error: `Failed to connect to database: ${routedDatabase}` },
                { status: 500 },
            );
        }

        const client = await pool.connect();

        try {
            // Set query timeout (30 seconds)
            await client.query("SET statement_timeout = 30000");

            // Strip database prefix from query since PostgreSQL doesn't support cross-DB queries
            // After routing to the correct DB, we need to remove "db_name." from table references
            const strippedQuery = stripDatabasePrefix(
                cleanedSql,
                routedDatabase,
            );

            // Execute the modified query
            const result = await client.query(strippedQuery);

            // Check if this is a data-returning query
            if (result.rows && result.fields) {
                return NextResponse.json({
                    rows: result.rows,
                    rowCount: result.rowCount || result.rows.length,
                    fields: result.fields.map((f) => f.name),
                    routedDatabase,
                });
            }

            // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
            return NextResponse.json({
                rows: [],
                rowCount: result.rowCount || 0,
                fields: [],
                routedDatabase,
            });
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        console.error("Workspace query error:", error);

        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(
            { error: "An unknown error occurred" },
            { status: 500 },
        );
    }
}
