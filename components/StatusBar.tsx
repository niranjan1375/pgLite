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
    contextProfileName?: string;
    onOpenContext?: () => void;
}

export default function StatusBar({
    environment,
    database,
    readOnly,
    rowCount,
    executionTime,
    latency,
    connected,
    contextProfileName,
    onOpenContext,
}: StatusBarProps) {
    const envColor = getEnvironmentColor(environment);
    const isProd = environment.includes("uat") || environment.includes("prod");

    const seg = {
        display: "flex" as const,
        alignItems: "center" as const,
        padding: "0 10px",
        height: "100%",
        borderRight: "1px solid var(--border)",
        whiteSpace: "nowrap" as const,
        gap: "6px",
    };

    const segLeft = {
        ...seg,
        borderRight: "none",
        borderLeft: "1px solid var(--border)",
    };

    return (
        <div
            className="flex items-center justify-between flex-shrink-0 border-t text-[11px] tracking-wide"
            style={{
                height: "28px",
                background: isProd ? "#0a0608" : "var(--panel)",
                borderColor: isProd ? `${envColor}30` : "var(--border)",
                color: "var(--text-muted)",
            }}
        >
            {/* Left — identity */}
            <div className="flex items-center h-full">
                <div
                    style={{
                        ...seg,
                        color: envColor,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontSize: "10px",
                        textShadow: `0 0 8px ${envColor}80`,
                    }}
                >
                    {environment || "—"}
                </div>

                {database && (
                    <div style={{ ...seg, color: "var(--text-primary)" }}>
                        {database}
                    </div>
                )}

                {readOnly && (
                    <div
                        style={{
                            ...seg,
                            color: "var(--warning)",
                            fontWeight: 600,
                            fontSize: "10px",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}
                    >
                        readonly
                    </div>
                )}

                {onOpenContext && (
                    <button
                        onClick={onOpenContext}
                        style={{
                            ...seg,
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                        title="Open context (Cmd/Ctrl+Shift+G)"
                    >
                        <span style={{ color: "var(--text-dim)" }}>ctx</span>
                        <span style={{ color: "var(--accent)" }}>
                            {contextProfileName || "none"}
                        </span>
                    </button>
                )}
            </div>

            {/* Right — stats + connection */}
            <div className="flex items-center h-full">
                {rowCount !== undefined && (
                    <div style={segLeft}>
                        <span style={{ color: "var(--text-dim)" }}>rows</span>
                        <span style={{ color: "var(--text-primary)" }}>
                            {rowCount.toLocaleString()}
                        </span>
                    </div>
                )}

                {executionTime !== undefined && (
                    <div style={segLeft}>
                        <span style={{ color: "var(--text-dim)" }}>time</span>
                        <span style={{ color: "var(--text-primary)" }}>
                            {executionTime}ms
                        </span>
                    </div>
                )}

                {latency !== undefined && (
                    <div style={segLeft}>
                        <span style={{ color: "var(--text-dim)" }}>lat</span>
                        <span style={{ color: "var(--text-primary)" }}>
                            {latency}ms
                        </span>
                    </div>
                )}

                <div style={{ ...segLeft }}>
                    <div
                        style={{
                            width: "6px",
                            height: "6px",
                            background: connected ? "var(--success)" : "var(--error)",
                            boxShadow: connected
                                ? "0 0 5px var(--success), 0 0 10px rgba(0,255,136,0.3)"
                                : "0 0 5px var(--error)",
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            color: connected ? "var(--success)" : "var(--error)",
                            fontSize: "10px",
                            letterSpacing: "0.06em",
                        }}
                    >
                        {connected ? "connected" : "offline"}
                    </span>
                </div>
            </div>
        </div>
    );
}
