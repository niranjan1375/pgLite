"use client";

interface ResultBannersProps {
    routedDatabase?: string;
    truncated?: boolean;
    rowCount?: number;
    totalRows?: number;
}

/** Notices above the results grid: workspace auto-routing and row-cap truncation. */
export default function ResultBanners({
    routedDatabase,
    truncated,
    rowCount = 0,
    totalRows,
}: ResultBannersProps) {
    return (
        <>
            {routedDatabase && (
                <div
                    className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide border-b flex items-center gap-2"
                    style={{
                        background: "rgba(59, 130, 246, 0.08)",
                        borderColor: "rgba(59, 130, 246, 0.3)",
                        color: "var(--accent)",
                    }}
                >
                    <span>🎯</span>
                    <span>AUTO-ROUTED TO:</span>
                    <span style={{ fontWeight: 600 }}>{routedDatabase}</span>
                </div>
            )}
            {truncated && (
                <div
                    className="px-3 py-1.5 text-[11px] uppercase tracking-wide border-b flex items-center gap-2"
                    style={{
                        background: "#1a1100",
                        borderColor: "var(--warning)",
                        color: "var(--warning)",
                    }}
                >
                    ⚠ RESULTS TRUNCATED — SHOWING FIRST{" "}
                    {rowCount.toLocaleString()}
                    {totalRows ? ` OF ${totalRows.toLocaleString()}` : ""} ROWS
                    · ADD A LIMIT CLAUSE TO REFINE
                </div>
            )}
        </>
    );
}
