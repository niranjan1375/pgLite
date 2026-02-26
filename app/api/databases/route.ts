import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
    try {
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
