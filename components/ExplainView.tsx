"use client";

import { useMemo, useState } from "react";

interface ExplainNode {
    "Node Type": string;
    "Relation Name"?: string;
    "Index Name"?: string;
    "Join Type"?: string;
    "Startup Cost"?: number;
    "Total Cost"?: number;
    "Actual Startup Time"?: number;
    "Actual Total Time"?: number;
    "Actual Rows"?: number;
    "Plan Rows"?: number;
    "Shared Hit Blocks"?: number;
    "Shared Read Blocks"?: number;
    Plans?: ExplainNode[];
    Filter?: string;
    "Index Cond"?: string;
    "Hash Cond"?: string;
    "Merge Cond"?: string;
}

interface ExplainPlan {
    Plan: ExplainNode;
    "Planning Time"?: number;
    "Execution Time"?: number;
}

interface ExplainViewProps {
    plan: ExplainPlan | null;
    executionTime?: number;
}

function formatMetric(value?: number, suffix = "") {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "-";
    }

    return `${value.toFixed(value >= 100 ? 0 : 2)}${suffix}`;
}

function getNodeTone(node: ExplainNode) {
    const time = node["Actual Total Time"] || 0;
    if (time >= 1000) {
        return {
            border: "rgba(239, 68, 68, 0.7)",
            background: "rgba(127, 29, 29, 0.22)",
            accent: "var(--error)",
        };
    }

    if (time >= 100) {
        return {
            border: "rgba(245, 158, 11, 0.6)",
            background: "rgba(120, 53, 15, 0.18)",
            accent: "var(--warning)",
        };
    }

    return {
        border: "var(--border)",
        background: "var(--panel)",
        accent: "var(--accent)",
    };
}

function collectSuggestions(plan: ExplainPlan | null): string[] {
    if (!plan) {
        return [];
    }

    const suggestions = new Set<string>();

    const visit = (node: ExplainNode) => {
        if (
            node["Node Type"] === "Seq Scan" &&
            node["Actual Rows"] &&
            node["Actual Rows"] > 1000
        ) {
            suggestions.add(
                `Sequential scan on ${node["Relation Name"] || "table"} touched many rows. Consider an index that matches the filter or join path.`,
            );
        }

        if (
            node["Node Type"] === "Nested Loop" &&
            (node["Actual Rows"] || 0) > 10000
        ) {
            suggestions.add(
                "Large nested loop detected. Check join indexes or compare with a hash join strategy.",
            );
        }

        if ((node["Shared Read Blocks"] || 0) > 1000) {
            suggestions.add(
                "High shared block reads detected. The query may be I/O bound or missing a selective index.",
            );
        }

        node.Plans?.forEach(visit);
    };

    visit(plan.Plan);

    if (suggestions.size === 0) {
        suggestions.add(
            "No obvious red flags detected in the top-level plan. Inspect row estimates versus actual rows for subtler issues.",
        );
    }

    return Array.from(suggestions);
}

function ExplainNodeCard({
    node,
    depth = 0,
}: {
    node: ExplainNode;
    depth?: number;
}) {
    const [expanded, setExpanded] = useState(true);
    const tone = getNodeTone(node);
    const hasChildren = Boolean(node.Plans && node.Plans.length > 0);

    return (
        <div style={{ marginLeft: depth === 0 ? 0 : 20 }}>
            <div
                className="border px-3 py-3"
                style={{
                    borderColor: tone.border,
                    background: tone.background,
                }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={() => setExpanded((prev) => !prev)}
                            className="flex items-center gap-2 text-left hover:opacity-85 transition-opacity"
                            style={{ color: "var(--text-primary)" }}
                        >
                            <span style={{ color: tone.accent }}>
                                {hasChildren ? (expanded ? "▼" : "▶") : "•"}
                            </span>
                            <span className="font-semibold">
                                {node["Node Type"]}
                            </span>
                            {node["Relation Name"] && (
                                <span style={{ color: "var(--text-muted)" }}>
                                    on {node["Relation Name"]}
                                </span>
                            )}
                            {node["Index Name"] && (
                                <span style={{ color: "var(--text-muted)" }}>
                                    via {node["Index Name"]}
                                </span>
                            )}
                        </button>
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-right whitespace-nowrap">
                        <div style={{ color: tone.accent }}>
                            {formatMetric(node["Actual Total Time"], "ms")}
                        </div>
                        <div style={{ color: "var(--text-muted)" }}>
                            {formatMetric(node["Actual Rows"])} rows
                        </div>
                    </div>
                </div>

                <div
                    className="mt-3 grid gap-2 text-[11px] uppercase tracking-wide"
                    style={{
                        color: "var(--text-muted)",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
                    }}
                >
                    <div>
                        Cost: {formatMetric(node["Startup Cost"])} →{" "}
                        {formatMetric(node["Total Cost"])}{" "}
                    </div>
                    <div>
                        Actual:{" "}
                        {formatMetric(node["Actual Startup Time"], "ms")} →{" "}
                        {formatMetric(node["Actual Total Time"], "ms")}
                    </div>
                    <div>
                        Rows: {formatMetric(node["Actual Rows"])} actual /{" "}
                        {formatMetric(node["Plan Rows"])} planned
                    </div>
                    <div>
                        Buffers: {formatMetric(node["Shared Hit Blocks"])} hit /{" "}
                        {formatMetric(node["Shared Read Blocks"])} read
                    </div>
                </div>

                {(node.Filter ||
                    node["Index Cond"] ||
                    node["Hash Cond"] ||
                    node["Merge Cond"] ||
                    node["Join Type"]) && (
                    <div
                        className="mt-3 text-[12px] space-y-1"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {node["Join Type"] && (
                            <div>Join: {node["Join Type"]}</div>
                        )}
                        {node.Filter && <div>Filter: {node.Filter}</div>}
                        {node["Index Cond"] && (
                            <div>Index Cond: {node["Index Cond"]}</div>
                        )}
                        {node["Hash Cond"] && (
                            <div>Hash Cond: {node["Hash Cond"]}</div>
                        )}
                        {node["Merge Cond"] && (
                            <div>Merge Cond: {node["Merge Cond"]}</div>
                        )}
                    </div>
                )}
            </div>

            {expanded && hasChildren && (
                <div className="mt-2 space-y-2">
                    {node.Plans?.map((child, index) => (
                        <ExplainNodeCard
                            key={`${child["Node Type"]}-${index}-${depth}`}
                            node={child}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ExplainView({ plan, executionTime }: ExplainViewProps) {
    const suggestions = useMemo(() => collectSuggestions(plan), [plan]);

    if (!plan) {
        return null;
    }

    return (
        <div
            className="h-full overflow-auto"
            style={{ background: "var(--bg)" }}
        >
            <div
                className="border-b px-4 py-3"
                style={{
                    borderColor: "var(--border)",
                    background: "var(--panel)",
                }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div
                            className="text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Explain Analyze
                        </div>
                        <div
                            className="text-[18px] font-semibold"
                            style={{ color: "var(--text-primary)" }}
                        >
                            {plan.Plan["Node Type"]}
                        </div>
                    </div>
                    <div className="text-right text-[11px] uppercase tracking-wide">
                        <div style={{ color: "var(--text-muted)" }}>
                            Planning {formatMetric(plan["Planning Time"], "ms")}
                        </div>
                        <div style={{ color: "var(--accent)" }}>
                            Execution{" "}
                            {formatMetric(
                                plan["Execution Time"] ?? executionTime,
                                "ms",
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <div
                    className="border px-4 py-3"
                    style={{
                        borderColor: "var(--border)",
                        background: "var(--panel)",
                    }}
                >
                    <div
                        className="text-[11px] uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-muted)" }}
                    >
                        Suggestions
                    </div>
                    <div
                        className="space-y-2 text-[12px]"
                        style={{ color: "var(--text-primary)" }}
                    >
                        {suggestions.map((suggestion) => (
                            <div key={suggestion}>{suggestion}</div>
                        ))}
                    </div>
                </div>

                <ExplainNodeCard node={plan.Plan} />
            </div>
        </div>
    );
}
