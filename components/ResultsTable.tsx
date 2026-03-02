"use client";

import { useState, useMemo, useRef, useEffect, memo } from "react";
import EmptyState from "@/components/EmptyState";

// Performance constants
const MAX_RENDERABLE_ROWS = 10000; // Hard cap to prevent browser freeze
const SORT_THRESHOLD = 5000; // Disable client sort above this
const LARGE_DATASET_WARNING = 50000; // Show warning badge

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

interface ColumnWidth {
    [key: string]: number;
}

interface SortConfig {
    field: string | null;
    direction: "asc" | "desc";
}

type Density = "compact" | "default";

export default function ResultsTable({
    result,
    error,
    loading,
}: ResultsTableProps) {
    const [copiedCell, setCopiedCell] = useState<string | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const [columnWidths, setColumnWidths] = useState<ColumnWidth>({});
    const [resizingColumn, setResizingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        field: null,
        direction: "asc",
    });
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
    const [expandedCell, setExpandedCell] = useState<{
        value: unknown;
        field: string;
        row: Record<string, unknown>;
    } | null>(null);
    const [density, setDensity] = useState<Density>("default");
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const resizeStartX = useRef<number>(0);
    const resizeStartWidth = useRef<number>(0);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // Virtual scrolling constants
    const ROW_HEIGHT = density === "compact" ? 32 : 41;
    const OVERSCAN = 15; // Extra rows to render above/below viewport for smooth scrolling

    // Derive column widths with defaults
    const effectiveColumnWidths = useMemo(() => {
        if (!result) return {};

        const widths: ColumnWidth = {};
        result.fields.forEach((field, idx) => {
            widths[field] = columnWidths[field] ?? (idx === 0 ? 200 : 180);
        });
        return widths;
    }, [result, columnWidths]);

    // Get visible columns (not hidden)
    const visibleFields = useMemo(() => {
        if (!result) return [];
        return result.fields.filter((field) => !hiddenColumns.has(field));
    }, [result, hiddenColumns]);

    // Sort rows based on sort config (with performance threshold)
    const sortedRows = useMemo(() => {
        if (!result || !sortConfig.field) return result?.rows || [];

        // Disable client-side sort for large datasets
        if (result.rowCount > SORT_THRESHOLD) {
            return result.rows;
        }

        const sorted = [...result.rows].sort((a, b) => {
            const aVal = a[sortConfig.field!];
            const bVal = b[sortConfig.field!];

            // Handle nulls and undefined - always sort to end
            if (
                (aVal === null || aVal === undefined) &&
                bVal !== null &&
                bVal !== undefined
            )
                return sortConfig.direction === "asc" ? 1 : -1;
            if (
                aVal !== null &&
                aVal !== undefined &&
                (bVal === null || bVal === undefined)
            )
                return sortConfig.direction === "asc" ? -1 : 1;
            if (
                (aVal === null || aVal === undefined) &&
                (bVal === null || bVal === undefined)
            )
                return 0;

            // Compare values
            if (aVal! < bVal!) return sortConfig.direction === "asc" ? -1 : 1;
            if (aVal! > bVal!) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });

        return sorted;
    }, [result, sortConfig]);

    // Cap rows to prevent browser freeze
    const cappedRows = useMemo(() => {
        return sortedRows.slice(0, MAX_RENDERABLE_ROWS);
    }, [sortedRows]);

    // Calculate dataset warnings
    const isLargeDataset = (result?.rowCount || 0) > LARGE_DATASET_WARNING;
    const isSortDisabled = (result?.rowCount || 0) > SORT_THRESHOLD;
    const isRowsCapped = sortedRows.length > MAX_RENDERABLE_ROWS;

    // Calculate visible rows based on scroll position
    const visibleRange = useMemo(() => {
        if (!cappedRows.length) return { start: 0, end: 0 };

        const visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
        const start = Math.floor(scrollTop / ROW_HEIGHT);
        const end = start + visibleRows;

        return {
            start: Math.max(0, start - OVERSCAN),
            end: Math.min(cappedRows.length, end + OVERSCAN),
        };
    }, [scrollTop, containerHeight, cappedRows, ROW_HEIGHT]);

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

    // Update container height with ResizeObserver (more performant)
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        resizeObserverRef.current = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height || 600);
            }
        });

        resizeObserverRef.current.observe(scrollContainerRef.current);

        return () => {
            resizeObserverRef.current?.disconnect();
        };
    }, []);

    const copyToClipboard = (text: string, cellId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedCell(cellId);
        setTimeout(() => setCopiedCell(null), 2000);
    };

    const copyRowAsJSON = (row: Record<string, unknown>) => {
        const json = JSON.stringify(row, null, 2);
        navigator.clipboard.writeText(json);
        setCopiedCell("row-json");
        setTimeout(() => setCopiedCell(null), 2000);
    };

    const handleSort = (field: string) => {
        // Prevent sort on large datasets
        if (isSortDisabled) return;

        setSortConfig((prev) => ({
            field,
            direction:
                prev.field === field && prev.direction === "asc"
                    ? "desc"
                    : "asc",
        }));
    };

    const toggleDensity = () => {
        setDensity((prev) => (prev === "default" ? "compact" : "default"));
    };

    const toggleColumnVisibility = (field: string) => {
        setHiddenColumns((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(field)) {
                newSet.delete(field);
            } else {
                newSet.add(field);
            }
            return newSet;
        });
    };

    // Column resize handlers
    const startResize = (field: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingColumn(field);
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = effectiveColumnWidths[field] || 180;
    };

    useEffect(() => {
        if (!resizingColumn) return;

        const handleMouseMove = (e: MouseEvent) => {
            const diff = e.clientX - resizeStartX.current;
            const newWidth = Math.max(80, resizeStartWidth.current + diff);
            setColumnWidths((prev) => ({
                ...prev,
                [resizingColumn]: newWidth,
            }));
        };

        const handleMouseUp = () => {
            setResizingColumn(null);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [resizingColumn]);

    // Keyboard shortcuts for modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && expandedCell) {
                setExpandedCell(null);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [expandedCell]);

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
                    {sortConfig.field && !isSortDisabled && (
                        <>
                            <span>│</span>
                            <span style={{ color: "var(--text-primary)" }}>
                                SORTED BY: {sortConfig.field}{" "}
                                {sortConfig.direction === "asc" ? "↑" : "↓"}
                            </span>
                        </>
                    )}
                    {isRowsCapped && (
                        <>
                            <span>│</span>
                            <span
                                className="px-1.5 py-0.5 border"
                                style={{
                                    color: "var(--warning)",
                                    borderColor: "var(--warning)",
                                    background: "rgba(255, 165, 0, 0.1)",
                                }}
                                title={`Showing ${MAX_RENDERABLE_ROWS.toLocaleString()} of ${sortedRows.length.toLocaleString()} rows`}
                            >
                                ⚠ CAPPED AT{" "}
                                {MAX_RENDERABLE_ROWS.toLocaleString()}
                            </span>
                        </>
                    )}
                    {isLargeDataset && (
                        <>
                            <span>│</span>
                            <span
                                className="px-1.5 py-0.5 border"
                                style={{
                                    color: "var(--text-muted)",
                                    borderColor: "var(--border)",
                                }}
                                title="Large dataset detected"
                            >
                                📊 LARGE DATASET
                            </span>
                        </>
                    )}
                    {isSortDisabled && sortConfig.field && (
                        <>
                            <span>│</span>
                            <span
                                className="px-1.5 py-0.5 border"
                                style={{
                                    color: "var(--warning)",
                                    borderColor: "var(--warning)",
                                }}
                                title={`Client-side sort disabled for datasets > ${SORT_THRESHOLD.toLocaleString()} rows. Use ORDER BY in query.`}
                            >
                                ⚠ USE ORDER BY
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleDensity}
                        className="px-2 py-0.5 hover:opacity-80 transition-opacity border text-[10px]"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-muted)",
                        }}
                        title={`Density: ${density === "default" ? "41px" : "32px"} rows`}
                    >
                        {density === "default" ? "COMPACT" : "DEFAULT"}
                    </button>
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
                        {visibleFields.map((field, idx) => (
                            <div
                                key={field}
                                className="px-3 py-2 text-left text-[11px] uppercase tracking-wider whitespace-nowrap flex-shrink-0 relative select-none"
                                style={{
                                    color: "var(--text-muted)",
                                    width: `${effectiveColumnWidths[field] || 180}px`,
                                    minWidth: `${effectiveColumnWidths[field] || 180}px`,
                                    borderRight:
                                        idx === visibleFields.length - 1
                                            ? "transparent"
                                            : "1px solid var(--grid-line)",
                                    paddingRight: "24px",
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    toggleColumnVisibility(field);
                                }}
                            >
                                <div
                                    className="flex items-center justify-between cursor-pointer hover:opacity-70 transition-opacity"
                                    onClick={() => handleSort(field)}
                                    title={
                                        isSortDisabled
                                            ? "Sort disabled - use ORDER BY in query"
                                            : "Click to sort, right-click to hide"
                                    }
                                    style={{
                                        opacity: isSortDisabled ? 0.5 : 1,
                                    }}
                                >
                                    <span className="truncate flex-1">
                                        {field}
                                    </span>
                                    {sortConfig.field === field &&
                                        !isSortDisabled && (
                                            <span className="ml-1 text-[10px]">
                                                {sortConfig.direction === "asc"
                                                    ? "↑"
                                                    : "↓"}
                                            </span>
                                        )}
                                </div>

                                {/* Resize Handle */}
                                <div
                                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30 transition-colors"
                                    onMouseDown={(e) => startResize(field, e)}
                                    title="Drag to resize"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Body */}
                    <div
                        className="relative"
                        style={{
                            height: `${cappedRows.length * ROW_HEIGHT}px`,
                        }}
                    >
                        {/* Render only visible rows */}
                        {cappedRows
                            .slice(visibleRange.start, visibleRange.end)
                            .map((row, idx) => {
                                const rowIdx = visibleRange.start + idx;
                                return (
                                    <div
                                        key={rowIdx}
                                        className="absolute w-full flex transition-colors border-b group/row"
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
                                        {visibleFields.map((field) => {
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
                                                        width: `${effectiveColumnWidths[field] || 180}px`,
                                                        minWidth: `${effectiveColumnWidths[field] || 180}px`,
                                                    }}
                                                >
                                                    <span
                                                        className="truncate flex-1 cursor-pointer hover:underline"
                                                        title={
                                                            value === null
                                                                ? "NULL"
                                                                : displayValue
                                                        }
                                                        onClick={() =>
                                                            setExpandedCell({
                                                                row,
                                                                field,
                                                                value,
                                                            })
                                                        }
                                                    >
                                                        {displayValue}
                                                    </span>
                                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 flex-shrink-0">
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
                                                            className="p-1 hover:opacity-60 transition-opacity text-[10px]"
                                                            style={{
                                                                color: "var(--text-muted)",
                                                            }}
                                                            title="Copy cell"
                                                        >
                                                            {copiedCell ===
                                                            cellId
                                                                ? "✓"
                                                                : "⎘"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Copy Row Button */}
                                        <button
                                            onClick={() => copyRowAsJSON(row)}
                                            className="absolute right-2 opacity-0 group-hover/row:opacity-100 px-2 py-1 hover:opacity-60 transition-opacity text-[10px] border"
                                            style={{
                                                color: "var(--text-muted)",
                                                borderColor: "var(--border)",
                                                background: "var(--panel)",
                                            }}
                                            title="Copy entire row as JSON"
                                        >
                                            JSON
                                        </button>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>

            {/* Expand Cell Modal */}
            {expandedCell && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0, 0, 0, 0.8)" }}
                    onClick={() => setExpandedCell(null)}
                >
                    <div
                        className="max-w-4xl w-full max-h-[80vh] overflow-auto p-6 border"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div
                                className="text-[11px] uppercase tracking-wide"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {expandedCell.field}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const value =
                                            expandedCell.value === null
                                                ? "NULL"
                                                : String(expandedCell.value);
                                        copyToClipboard(value, "expanded-cell");
                                    }}
                                    className="px-3 py-1 text-[11px] uppercase border hover:opacity-70 transition-opacity"
                                    style={{
                                        borderColor: "var(--border)",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {copiedCell === "expanded-cell"
                                        ? "✓ COPIED"
                                        : "COPY"}
                                </button>
                                <button
                                    onClick={() => setExpandedCell(null)}
                                    className="px-3 py-1 text-[11px] uppercase border hover:opacity-70 transition-opacity"
                                    style={{
                                        borderColor: "var(--border)",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    CLOSE (ESC)
                                </button>
                            </div>
                        </div>

                        <JSONViewer value={expandedCell.value} />
                    </div>
                </div>
            )}
        </div>
    );
}

// Memoized JSONViewer component - prevents re-renders and isolates heavy computation
const JSONViewer = memo(({ value }: { value: unknown }) => {
    const content = useMemo(() => {
        if (value === null || value === undefined) {
            return (
                <div style={{ color: "var(--text-muted)" }}>
                    {value === null ? "NULL" : "undefined"}
                </div>
            );
        }

        const valueStr = String(value);

        // Try to parse and prettify JSON
        try {
            const parsed = JSON.parse(valueStr);
            const prettified = JSON.stringify(parsed, null, 2);

            // Simple syntax highlighting with memoized regex
            return prettified.split("\n").map((line, idx) => {
                let coloredLine = line;
                const keyMatch = line.match(/"([^"]+)":/);

                if (keyMatch) {
                    coloredLine = line.replace(
                        /"([^"]+)":/,
                        `<span style="color: #569cd6">"${keyMatch[1]}"</span>:`,
                    );
                }

                // String values
                coloredLine = coloredLine.replace(/"([^"]+)"/g, (match, p1) => {
                    if (!match.endsWith(":")) {
                        return `<span style="color: #ce9178">"${p1}"</span>`;
                    }
                    return match;
                });

                // Numbers
                coloredLine = coloredLine.replace(
                    /:\s*(\d+\.?\d*)/g,
                    ': <span style="color: #b5cea8">$1</span>',
                );

                // Booleans and null
                coloredLine = coloredLine.replace(
                    /\b(true|false|null)\b/g,
                    '<span style="color: #569cd6">$1</span>',
                );

                return (
                    <div
                        key={idx}
                        dangerouslySetInnerHTML={{ __html: coloredLine }}
                    />
                );
            });
        } catch {
            // Not JSON, display as plain text
            return <div>{valueStr}</div>;
        }
    }, [value]);

    return (
        <div
            className="p-4 text-[13px] font-mono whitespace-pre-wrap break-words border"
            style={{
                background: "var(--bg)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
            }}
        >
            {content}
        </div>
    );
});

JSONViewer.displayName = "JSONViewer";
