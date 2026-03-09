import { NextRequest, NextResponse } from "next/server";
import { listTemplates, parseTemplate, writeTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const templates = await listTemplates();
        return NextResponse.json({ templates });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to list templates.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const name = typeof body?.name === "string" ? body.name : "";
        const content = typeof body?.content === "string" ? body.content : "";

        if (!name.trim()) {
            return NextResponse.json(
                { error: "Template name is required." },
                { status: 400 },
            );
        }

        if (!content.trim()) {
            return NextResponse.json(
                { error: "Template content is required." },
                { status: 400 },
            );
        }

        parseTemplate(content);

        const savedName = await writeTemplate(name, content);

        return NextResponse.json({ name: savedName }, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to save template.";

        const status =
            message.includes("Template") ||
            message.includes("Invalid") ||
            message.includes("required") ||
            message.includes("variable")
                ? 400
                : 500;

        return NextResponse.json({ error: message }, { status });
    }
}
