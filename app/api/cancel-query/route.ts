import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getRunningQuery, unregisterQuery } from "@/lib/query-registry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const queryId: string = body?.queryId;

        if (!queryId || typeof queryId !== "string") {
            return NextResponse.json(
                { error: "queryId is required." },
                { status: 400 },
            );
        }

        const running = getRunningQuery(queryId);
        if (!running) {
            // Already finished, cancelled, or never registered. Treat as a
            // no-op success so the client can cancel without racing the result.
            return NextResponse.json({ cancelled: false, reason: "not_found" });
        }

        // Issue the cancel over a fresh connection — the connection running the
        // target query is busy and cannot cancel itself.
        const pool = getPool(running.environment, running.database);
        const result = await pool.query("SELECT pg_cancel_backend($1) AS ok", [
            running.pid,
        ]);
        const cancelled = result.rows[0]?.ok === true;

        // The query route removes its own registry entry in its finally block,
        // but drop it here too so a repeated cancel is a clean no-op.
        unregisterQuery(queryId);

        return NextResponse.json({ cancelled });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
