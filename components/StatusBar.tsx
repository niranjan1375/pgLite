"use client";

import { getEnvironmentColor } from "@/lib/design-system";

interface StatusBarProps {
    environment: string;
    database: string;
    readOnly: boolean;
    rowCount?: number;
    executionTime?: number;
    latency?: number;
    /** null while the first ping for this environment is in flight. */
    connected: boolean | null;
    production: boolean;
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
    production,
    contextProfileName,
    onOpenContext,
}: StatusBarProps) {
    const envColor = getEnvironmentColor(environment);
    const isProd = production;
    const statusColor =
        connected === null
            ? "var(--text-dim)"
            : connected
              ? "var(--success)"
              : "var(--error)";

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
                borderColor: isProd
                    ? `color-mix(in srgb, ${envColor} 19%, transparent)`
                    : "var(--border)",
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
                            background: statusColor,
                            boxShadow:
                                connected === null
                                    ? "none"
                                    : `0 0 5px ${statusColor}`,
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            color: statusColor,
                            fontSize: "10px",
                            letterSpacing: "0.06em",
                        }}
                    >
                        {connected === null
                            ? "checking"
                            : connected
                              ? "connected"
                              : "offline · retrying"}
                    </span>
                </div>
            </div>
        </div>
    );
}
