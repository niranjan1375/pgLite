import { NextResponse } from "next/server";
import {
    getDefaultEnvironment,
    getEnvironmentSummaries,
} from "@/lib/environments";

export async function GET() {
    return NextResponse.json({
        environments: getEnvironmentSummaries(),
        defaultEnvironment: getDefaultEnvironment(),
    });
}
