import { NextResponse } from "next/server";
import { readTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

interface Params {
    params: Promise<{ name: string }>;
}

export async function GET(_: Request, { params }: Params) {
    try {
        const { name } = await params;
        const content = await readTemplate(name);
        return NextResponse.json({ content });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to read template.";

        const status = message.includes("not found") ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
