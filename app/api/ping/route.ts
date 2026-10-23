import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const start = Date.now();

    try {
        const environment =
            req.nextUrl.searchParams.get("environment") ||
            getDefaultEnvironment();

        const pool = getPool(environment);
        await pool.query("SELECT 1");
        const latencyMs = Date.now() - start;

        return NextResponse.json({ ok: true, latencyMs });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Connection failed.";
        return NextResponse.json(
            { ok: false, error: message },
            { status: 503 },
        );
    }
}
