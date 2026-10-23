import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";
import { cachedSchema, schemaCacheKey } from "@/lib/schema-cache";

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const environment =
            searchParams.get("environment") || getDefaultEnvironment();
        const forceRefresh = searchParams.get("refresh") === "1";

        const { data } = await cachedSchema(
            schemaCacheKey("databases", environment),
            async () => {
                const pool = getPool(environment);
                const result = await pool.query(`
                    SELECT datname
                    FROM pg_database
                    WHERE datistemplate = false
                    ORDER BY datname;
                `);
                return result.rows.map((row) => row.datname as string);
            },
            { force: forceRefresh },
        );

        return NextResponse.json({ databases: data });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
