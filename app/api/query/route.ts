import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = body?.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "Query cannot be empty." }, { status: 400 });
    }

    const result = await pool.query(query);

    return NextResponse.json({
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
      fields: result.fields.map((f) => f.name),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unknown error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
