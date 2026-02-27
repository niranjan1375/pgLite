import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const environment = searchParams.get("environment") || "loadtest";

        const pool = getPool(environment);
        const result = await pool.query(`
      SELECT datname 
      FROM pg_database 
      WHERE datistemplate = false 
      ORDER BY datname;
    `);

        return NextResponse.json({
            databases: result.rows.map((row) => row.datname),
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
