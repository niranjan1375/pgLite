import { NextRequest, NextResponse } from "next/server";
import {
    ContextValidationError,
    readContexts,
    writeContexts,
} from "@/lib/contexts";

export const dynamic = "force-dynamic";

// GET /api/contexts — return the full Context document (all profiles).
export async function GET() {
    try {
        const contexts = await readContexts();
        return NextResponse.json(contexts);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to read contexts.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// PUT /api/contexts — replace the full Context document (create/update/delete
// profiles and values in one save).
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Request body must be valid JSON." },
            { status: 400 },
        );
    }

    try {
        const saved = await writeContexts(body);
        return NextResponse.json(saved);
    } catch (error) {
        if (error instanceof ContextValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const message =
            error instanceof Error ? error.message : "Failed to save contexts.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
