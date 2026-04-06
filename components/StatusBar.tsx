"use client";

import { getEnvironmentColor } from "@/lib/design-system";

interface StatusBarProps {
    environment: string;
    database: string;
    readOnly: boolean;
    rowCount?: number;
    executionTime?: number;
    latency?: number;
    connected: boolean;
}

export default function StatusBar({
    environment,
    database,
    readOnly,
    rowCount,
    executionTime,
    latency,
    connected,
}: StatusBarProps) {
    const envColor = getEnvironmentColor(environment);
    const isProd = environment.includes("uat") || environment.includes("prod");

    return (
        <div
            className="h-[26px] flex items-center justify-between px-3 text-[11px]  tracking-wide border-t"
            style={{
                background: isProd ? "#1a0d0d" : "var(--panel)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
            }}
        >
            {/* Left: Environment Info */}
            <div className="flex items-center gap-3">
                <span style={{ color: envColor }} className="font-bold">
                    {environment}
                </span>
                <span>│</span>
                <span>{database}</span>
                {readOnly && (
                    <>
                        <span>│</span>
                        <span style={{ color: "var(--warning)" }}>
                            readonly
                        </span>
                    </>
                )}
                <span>│</span>
                {(rowCount !== undefined || executionTime !== undefined) && (
                    <div className="flex  gap-3">
                        {rowCount !== undefined && (
                            <>
                                <span>Rows: {rowCount.toLocaleString()}</span>
                                <span>│</span>
                            </>
                        )}
                        {executionTime !== undefined && (
                            <>
                                <span>Time: {executionTime}ms</span>
                            </>
                        )}
                        {latency !== undefined && (
                            <>
                                <span>│</span>
                                <span>Latency: {latency}ms</span>
                            </>
                        )}
                    </div>
                )}
                <span>│</span>
                <div
                    className="w-1.5 h-1.5"
                    style={{
                        background: connected
                            ? "var(--success)"
                            : "var(--error)",
                    }}
                />
                <span>{connected ? "Connected" : "Disconnected"}</span>
            </div>
        </div>
    );
}
