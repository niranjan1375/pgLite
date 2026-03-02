"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import EmptyState from "@/components/EmptyState";

interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: string[];
}

interface ResultsTableProps {
    result: QueryResult | null;
    error: string | null;
    loading: boolean;
}

export default function ResultsTable({
    result,
    error,
    loading,
}: ResultsTableProps) {
    const [copiedCell, setCopiedCell] = useState<string | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Virtual scrolling constants
    const ROW_HEIGHT = 41; // Height of each row in pixels
    const OVERSCAN = 15; // Extra rows to render above/below viewport for smooth scrolling

    // Calculate visible rows based on scroll position
    const visibleRange = useMemo(() => {
        if (!result) return { start: 0, end: 0 };

        const visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
        const start = Math.floor(scrollTop / ROW_HEIGHT);
        const end = start + visibleRows;

        return {
            start: Math.max(0, start - OVERSCAN),
            end: Math.min(result.rows.length, end + OVERSCAN),
        };
    }, [scrollTop, containerHeight, result]);

    // Handle scroll event
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    // Update container height and reset scroll when result changes
    useEffect(() => {
        const timer = setTimeout(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
                setContainerHeight(
                    scrollContainerRef.current.clientHeight || 600,
                );
            }
            setScrollTop(0);
        }, 0);
        return () => clearTimeout(timer);
    }, [result]);

    // Update container height on mount and resize
    useEffect(() => {
        const updateHeight = () => {
            if (scrollContainerRef.current) {
                setContainerHeight(
                    scrollContainerRef.current.clientHeight || 600,
                );
            }
        };

        updateHeight();
        window.addEventListener("resize", updateHeight);
        return () => window.removeEventListener("resize", updateHeight);
    }, []);

    const copyToClipboard = (text: string, cellId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedCell(cellId);
        setTimeout(() => setCopiedCell(null), 2000);
    };

    const exportAsCSV = () => {
        if (!result || result.rows.length === 0) return;

        const headers = result.fields.join(",");
        const rows = result.rows.map((row) =>
            result.fields
                .map((field) => {
                    const value = row[field];
                    if (value === null) return "NULL";
                    const str = String(value);
                    // Escape quotes and wrap in quotes if contains comma
                    if (str.includes(",") || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                })
                .join(","),
        );

        const csv = [headers, ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `query-result-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportAsJSON = () => {
        if (!result || result.rows.length === 0) return;

        const json = JSON.stringify(result.rows, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `query-result-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div
                className="flex items-center justify-center h-32"
                style={{ color: "var(--text-muted)" }}
            >
                <div className="flex items-center gap-2 text-[12px]">
                    <span className="inline-block w-2 h-2 border border-current border-t-transparent animate-spin" />
                    <span className="uppercase tracking-wide">
                        Executing query...
                    </span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className="px-4 py-3 text-[12px] border"
                style={{
                    background: "#1a0505",
                    borderColor: "var(--error)",
                    color: "var(--error)",
                }}
            >
                <div className="uppercase tracking-wide mb-2">Query Error</div>
                <div style={{ color: "var(--text-muted)" }}>{error}</div>
            </div>
        );
    }

    if (!result) {
        return (
            <EmptyState
                icon="⚡"
                title="No query executed"
                description="Write a SQL query above and press ⌘+Enter to execute"
            />
        );
    }

    if (result.fields.length === 0) {
        return (
            <div
                className="px-4 py-3 text-[12px] border"
                style={{
                    background: "#0a1a0a",
                    borderColor: "var(--success)",
                    color: "var(--success)",
                }}
            >
                <div className="uppercase tracking-wide">
                    Query executed successfully.{" "}
                    {result.rowCount > 0 &&
                        `${result.rowCount} row(s) affected.`}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Results Header - UPPERCASE META */}
            <div
                className="h-[32px] flex items-center justify-between px-3 text-[11px] uppercase tracking-wide border-b"
                style={{
                    background: "var(--panel)",
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                }}
            >
                <div className="flex items-center gap-3">
                    <span>
                        RESULTS ({result.rowCount.toLocaleString()} ROWS)
                    </span>
                    <span>│</span>
                    <span>{result.fields.length} COLS</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportAsJSON}
                        className="px-2 py-0.5 hover:opacity-80 transition-opacity border text-[10px]"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-muted)",
                        }}
                        title="Export as JSON"
                    >
                        JSON
                    </button>
                    <button
                        onClick={exportAsCSV}
                        className="px-2 py-0.5 hover:opacity-80 transition-opacity border text-[10px]"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-muted)",
                        }}
                        title="Export as CSV"
                    >
                        CSV
                    </button>
                </div>
            </div>

            {/* Results Table */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-auto"
                style={{ background: "var(--bg)" }}
            >
                <div className="min-w-full">
                    {/* Header */}
                    <div
                        className="sticky top-0 z-10 flex border-b"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                        }}
                    >
                        {result.fields.map((field, idx) => (
                            <div
                                key={field}
                                className="px-3 py-2 text-left text-[11px] uppercase tracking-wider whitespace-nowrap flex-shrink-0"
                                style={{
                                    color: "var(--text-muted)",
                                    width: idx === 0 ? "200px" : "180px",
                                    minWidth: idx === 0 ? "200px" : "180px",
                                    borderRight:
                                        idx === result.fields.length - 1
                                            ? "transparent"
                                            : "1px solid var(--grid-line)",
                                    paddingRight: "10px",
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="truncate">{field}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Body */}
                    <div
                        className="relative"
                        style={{
                            height: `${result.rows.length * ROW_HEIGHT}px`,
                        }}
                    >
                        {/* Render only visible rows */}
                        {result.rows
                            .slice(visibleRange.start, visibleRange.end)
                            .map((row, idx) => {
                                const rowIdx = visibleRange.start + idx;
                                return (
                                    <div
                                        key={rowIdx}
                                        className="absolute w-full flex transition-colors border-b"
                                        style={{
                                            top: `${rowIdx * ROW_HEIGHT}px`,
                                            height: `${ROW_HEIGHT}px`,
                                            borderColor: "var(--grid-line)",
                                            background: "var(--bg)",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background =
                                                "var(--panel)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background =
                                                "var(--bg)";
                                        }}
                                    >
                                        {result.fields.map(
                                            (field, fieldIdx) => {
                                                const cellId = `${rowIdx}-${field}`;
                                                const value = row[field];
                                                const displayValue =
                                                    value === null
                                                        ? "␀"
                                                        : String(value);

                                                return (
                                                    <div
                                                        key={field}
                                                        className="px-3 py-2 text-[12px] whitespace-nowrap group relative flex items-center flex-shrink-0"
                                                        style={{
                                                            color:
                                                                value === null
                                                                    ? "var(--text-muted)"
                                                                    : "var(--text-primary)",
                                                            width:
                                                                fieldIdx === 0
                                                                    ? "200px"
                                                                    : "180px",
                                                            minWidth:
                                                                fieldIdx === 0
                                                                    ? "200px"
                                                                    : "180px",
                                                        }}
                                                    >
                                                        <span
                                                            className="truncate flex-1"
                                                            title={
                                                                value === null
                                                                    ? "NULL"
                                                                    : displayValue
                                                            }
                                                        >
                                                            {displayValue}
                                                        </span>
                                                        <button
                                                            onClick={() =>
                                                                copyToClipboard(
                                                                    value ===
                                                                        null
                                                                        ? "NULL"
                                                                        : displayValue,
                                                                    cellId,
                                                                )
                                                            }
                                                            className="opacity-0 group-hover:opacity-100 p-1 ml-2 hover:opacity-60 transition-opacity flex-shrink-0 text-[10px]"
                                                            style={{
                                                                color: "var(--text-muted)",
                                                            }}
                                                            title="Copy value"
                                                        >
                                                            {copiedCell ===
                                                            cellId
                                                                ? "✓"
                                                                : "⎘"}
                                                        </button>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
        </div>
    );
}
