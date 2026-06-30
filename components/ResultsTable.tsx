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
    fieldTypes?: number[];
}

interface TableViewState {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    sortColumn: string | null;
    sortDirection: "asc" | "desc";
    searchQuery: string;
}

interface ResultsTableProps {
    result: QueryResult | null;
    error: string | null;
    loading: boolean;
    readOnly?: boolean;
    tableName?: string;
    tableView?: TableViewState | null;
    onTableViewChange?: (
        updates: Partial<
            Pick<
                TableViewState,
                | "page"
                | "pageSize"
                | "sortColumn"
                | "sortDirection"
                | "searchQuery"
            >
        >,
    ) => void;
    onRefreshTableView?: () => void;
    onDeleteRow?: (row: Record<string, unknown>) => void;
}

interface ColumnWidth {
    [key: string]: number;
}

interface SortConfig {
    field: string | null;
    direction: "asc" | "desc";
}

type Density = "compact" | "default";

const ROW_NUM_WIDTH = 28;

// PostgreSQL OID → display type label
const PG_OID_TYPES: Record<number, string> = {
    16: "bool",
    17: "bytea",
    20: "int8",
    21: "int2",
    23: "int4",
    25: "text",
    26: "oid",
    114: "json",
    700: "float4",
    701: "float8",
    790: "money",
    869: "inet",
    1042: "char",
    1043: "varchar",
    1082: "date",
    1083: "time",
    1114: "timestamp",
    1184: "timestamptz",
    1186: "interval",
    1700: "numeric",
    2950: "uuid",
    3802: "jsonb",
};

export default function ResultsTable({
    result,
    error,
    loading,
    readOnly = true,
    tableName,
    tableView,
    onTableViewChange,
    onRefreshTableView,
    onDeleteRow,
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
    const [expandedRow, setExpandedRow] = useState<Record<
        string,
        unknown
    > | null>(null);
    const [density, setDensity] = useState<Density>("default");
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const resizeStartX = useRef<number>(0);
    const resizeStartWidth = useRef<number>(0);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const searchDebounceRef = useRef<number | null>(null);

    const hasTableViewControls = Boolean(tableView && onTableViewChange);

    useEffect(() => {
        return () => {
            if (searchDebounceRef.current !== null) {
                window.clearTimeout(searchDebounceRef.current);
            }
        };
    }, []);

    // Virtual scrolling constants
    const ROW_HEIGHT = density === "compact" ? 26 : 32;
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

    // Derive column types from OIDs returned by the server (accurate for any query)
    const columnTypes = useMemo(() => {
        if (!result) return {} as Record<string, string>;
        const types: Record<string, string> = {};
        result.fields.forEach((field, idx) => {
            const oid = result.fieldTypes?.[idx];
            types[field] = (oid !== undefined ? PG_OID_TYPES[oid] : undefined) ?? "text";
        });
        return types;
    }, [result]);

    // Get visible columns (not hidden)
    const visibleFields = useMemo(() => {
        if (!result) return [];
        return result.fields.filter((field) => !hiddenColumns.has(field));
    }, [result, hiddenColumns]);

    const totalResultRows = tableView?.totalRows ?? result?.rowCount ?? 0;
    const activeSortField = tableView?.sortColumn ?? sortConfig.field;
    const activeSortDirection =
        tableView?.sortDirection ?? sortConfig.direction;

    // Sort rows based on sort config (with performance threshold)
    const sortedRows = useMemo(() => {
        if (!result) return [];
        if (hasTableViewControls) {
            return result.rows;
        }

        if (!sortConfig.field) return result.rows;

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
    }, [result, sortConfig, hasTableViewControls]);

    // Cap rows to prevent browser freeze
    const cappedRows = useMemo(() => {
        return sortedRows.slice(0, MAX_RENDERABLE_ROWS);
    }, [sortedRows]);

    // Calculate dataset warnings
    const isLargeDataset = totalResultRows > LARGE_DATASET_WARNING;
    const isSortDisabled =
        !hasTableViewControls && totalResultRows > SORT_THRESHOLD;
    const isRowsCapped =
        !hasTableViewControls && sortedRows.length > MAX_RENDERABLE_ROWS;

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
        if (tableView && onTableViewChange) {
            onTableViewChange({
                sortColumn: field,
                sortDirection:
                    tableView.sortColumn === field &&
                    tableView.sortDirection === "asc"
                        ? "desc"
                        : "asc",
                page: 1,
            });
            return;
        }

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
            if (e.key === "Escape") {
                if (expandedRow) {
                    setExpandedRow(null);
                } else if (expandedCell) {
                    setExpandedCell(null);
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [expandedCell, expandedRow]);

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
        // Try to extract structured PG error fields from the message
        const pgCode = error.match(/\b([0-9A-Z]{5})\b/)?.[1];
        const hintMatch = error.match(/HINT[:\s]+(.+?)(?:\n|$)/i);
        const detailMatch = error.match(/DETAIL[:\s]+(.+?)(?:\n|$)/i);
        const positionMatch = error.match(/position[:\s]+(\d+)/i);
        const hint = hintMatch?.[1]?.trim();
        const detail = detailMatch?.[1]?.trim();
        const position = positionMatch?.[1];

        // Clean message — strip trailing structured fields
        const cleanMessage = error
            .replace(/\n?(HINT|DETAIL|CONTEXT|WHERE|POSITION)[:\s][\s\S]*/i, "")
            .trim();

        return (
            <div
                className="m-3 border text-[12px]"
                style={{
                    background: "rgba(255,45,85,0.04)",
                    borderColor: "rgba(255,45,85,0.35)",
                    borderLeft: "3px solid var(--error)",
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-3 px-4 py-2 border-b"
                    style={{ borderColor: "rgba(255,45,85,0.2)" }}
                >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round">
                        <circle cx="6.5" cy="6.5" r="5.5" />
                        <line x1="6.5" y1="4" x2="6.5" y2="7" />
                        <circle cx="6.5" cy="9" r="0.5" fill="var(--error)" stroke="none" />
                    </svg>
                    <span
                        className="uppercase tracking-widest text-[10px] font-bold"
                        style={{ color: "var(--error)" }}
                    >
                        query error
                    </span>
                    {pgCode && (
                        <span
                            className="ml-auto px-2 py-0.5 text-[10px] font-mono border"
                            style={{
                                color: "var(--error)",
                                borderColor: "rgba(255,45,85,0.3)",
                            }}
                        >
                            {pgCode}
                        </span>
                    )}
                </div>

                {/* Main message */}
                <div className="px-4 py-3" style={{ color: "var(--error)", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}>
                    {cleanMessage}
                </div>

                {/* Structured fields */}
                {(detail || hint || position) && (
                    <div
                        className="px-4 pb-3 flex flex-col gap-1.5"
                        style={{ borderTop: "1px solid rgba(255,45,85,0.1)" }}
                    >
                        {detail && (
                            <div className="flex gap-2 pt-2">
                                <span className="text-[10px] uppercase tracking-wider flex-shrink-0 pt-px" style={{ color: "rgba(255,45,85,0.5)", width: 48 }}>detail</span>
                                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{detail}</span>
                            </div>
                        )}
                        {hint && (
                            <div className="flex gap-2">
                                <span className="text-[10px] uppercase tracking-wider flex-shrink-0 pt-px" style={{ color: "rgba(0,255,136,0.5)", width: 48 }}>hint</span>
                                <span className="text-[11px]" style={{ color: "rgba(0,255,136,0.7)" }}>{hint}</span>
                            </div>
                        )}
                        {position && (
                            <div className="flex gap-2">
                                <span className="text-[10px] uppercase tracking-wider flex-shrink-0 pt-px" style={{ color: "rgba(0,229,255,0.5)", width: 48 }}>pos</span>
                                <span className="text-[11px]" style={{ color: "rgba(0,229,255,0.7)" }}>character {position}</span>
                            </div>
                        )}
                    </div>
                )}
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
                className="h-[32px] flex items-center justify-between gap-3 px-3 text-[11px] uppercase tracking-wide border-b overflow-x-auto"
                style={{
                    background: "var(--panel)",
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                }}
            >
                <div className="flex items-center gap-3 min-w-0 whitespace-nowrap">
                    <span>
                        RESULTS ({totalResultRows.toLocaleString()} ROWS)
                    </span>
                    {tableName && (
                        <>
                            <span>│</span>
                            <span style={{ color: "var(--text-primary)" }}>
                                {tableName}
                            </span>
                        </>
                    )}
                    <span>│</span>
                    <span>{result.fields.length} COLS</span>
                    {activeSortField && !isSortDisabled && (
                        <>
                            <span>│</span>
                            <span style={{ color: "var(--text-primary)" }}>
                                SORTED BY: {activeSortField}{" "}
                                {activeSortDirection === "asc" ? "↑" : "↓"}
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
                <div className="flex items-center gap-2 shrink-0">
                    {tableView && onRefreshTableView && (
                        <button
                            onClick={onRefreshTableView}
                            className="px-2 py-0.5 hover:opacity-80 transition-opacity border text-[10px]"
                            style={{
                                borderColor: "var(--border)",
                                color: "var(--text-muted)",
                            }}
                            title="Refresh current table preview"
                        >
                            REFRESH
                        </button>
                    )}
                    <button
                        onClick={toggleDensity}
                        className="px-2 py-0.5 hover:opacity-80 transition-opacity border text-[10px]"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-muted)",
                        }}
                        title={`Density: ${density === "default" ? "32px" : "26px"} rows`}
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

            {tableView && onTableViewChange && (
                <div
                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-3 border-b"
                    style={{
                        background: "var(--panel)",
                        borderColor: "var(--border)",
                    }}
                >
                    <div className="flex items-center gap-2 min-w-[280px] flex-1">
                        <input
                            key={tableView.searchQuery}
                            defaultValue={tableView.searchQuery}
                            onChange={(e) => {
                                if (searchDebounceRef.current !== null) {
                                    window.clearTimeout(
                                        searchDebounceRef.current,
                                    );
                                }

                                const nextValue = e.target.value;
                                searchDebounceRef.current = window.setTimeout(
                                    () => {
                                        onTableViewChange({
                                            searchQuery: nextValue,
                                            page: 1,
                                        });
                                    },
                                    250,
                                );
                            }}
                            placeholder="Filter rows across visible columns..."
                            className="min-w-0 flex-1 px-3 py-1.5 text-[12px] border outline-none"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        />
                        {tableView.searchQuery && (
                            <button
                                onClick={() =>
                                    onTableViewChange({
                                        searchQuery: "",
                                        page: 1,
                                    })
                                }
                                className="px-2 py-1 text-[10px] border hover:opacity-80 transition-opacity"
                                style={{
                                    borderColor: "var(--border)",
                                    color: "var(--text-muted)",
                                }}
                            >
                                CLEAR
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                        <span style={{ color: "var(--text-muted)" }}>
                            Showing {result.rows.length.toLocaleString()} of{" "}
                            {tableView.totalRows.toLocaleString()}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>│</span>
                        <label
                            htmlFor="table-view-page-size"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Page Size
                        </label>
                        <select
                            id="table-view-page-size"
                            value={tableView.pageSize}
                            onChange={(e) =>
                                onTableViewChange({
                                    pageSize: Number.parseInt(
                                        e.target.value,
                                        10,
                                    ),
                                    page: 1,
                                })
                            }
                            className="px-2 py-1 text-[11px] border"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={250}>250</option>
                        </select>
                        <button
                            onClick={() =>
                                onTableViewChange({
                                    page: Math.max(1, tableView.page - 1),
                                })
                            }
                            disabled={tableView.page <= 1}
                            className="px-2 py-1 text-[10px] border hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                                borderColor: "var(--border)",
                                color: "var(--text-muted)",
                            }}
                        >
                            PREV
                        </button>
                        <span style={{ color: "var(--text-primary)" }}>
                            PAGE {tableView.page} OF {tableView.totalPages}
                        </span>
                        <button
                            onClick={() =>
                                onTableViewChange({
                                    page: Math.min(
                                        tableView.totalPages,
                                        tableView.page + 1,
                                    ),
                                })
                            }
                            disabled={tableView.page >= tableView.totalPages}
                            className="px-2 py-1 text-[10px] border hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                                borderColor: "var(--border)",
                                color: "var(--text-muted)",
                            }}
                        >
                            NEXT
                        </button>
                    </div>
                </div>
            )}

            {/* Results Table */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-auto"
                style={{ background: "var(--bg)" }}
            >
                <div className="min-w-full">
                    {/* ── Header ─────────────────────────────────────────── */}
                    <div
                        className="sticky top-0 z-20 flex border-b"
                        style={{
                            background: "var(--panel-elevated)",
                            borderColor: "var(--border-bright)",
                        }}
                    >
                        {/* Row-number header cell */}
                        <div
                            className="sticky left-0 z-30 flex-shrink-0 flex items-center justify-center text-[10px] select-none"
                            style={{
                                width: ROW_NUM_WIDTH,
                                minWidth: ROW_NUM_WIDTH,
                                background: "var(--panel-elevated)",
                                borderRight: "1px solid var(--grid-line)",
                                borderBottom: "1px solid var(--border-bright)",
                                color: "var(--text-dim)",
                            }}
                        >
                            #
                        </div>

                        {/* Actions header */}
                        <div
                            className="flex-shrink-0 flex items-center justify-center text-[10px] uppercase tracking-wider"
                            style={{
                                width: readOnly ? 100 : 150,
                                minWidth: readOnly ? 100 : 150,
                                background: "var(--panel-elevated)",
                                borderRight: "1px solid var(--grid-line)",
                                borderBottom: "1px solid var(--border-bright)",
                                color: "var(--text-muted)",
                            }}
                        >
                            Actions
                        </div>

                        {/* Column headers */}
                        {visibleFields.map((field, idx) => {
                            const isActiveSort = activeSortField === field && !isSortDisabled;
                            const colType = columnTypes[field];
                            const colW = effectiveColumnWidths[field] || 180;

                            return (
                                <div
                                    key={field}
                                    className="flex-shrink-0 relative select-none"
                                    style={{
                                        width: colW,
                                        minWidth: colW,
                                        borderRight: idx === visibleFields.length - 1 ? "none" : "1px solid var(--grid-line)",
                                        borderBottom: "1px solid var(--border-bright)",
                                        paddingRight: 20,
                                    }}
                                    onContextMenu={(e) => { e.preventDefault(); toggleColumnVisibility(field); }}
                                >
                                    <div
                                        className="flex items-baseline gap-2 cursor-pointer hover:opacity-80 transition-opacity px-3 py-1.5"
                                        onClick={() => handleSort(field)}
                                        title={isSortDisabled ? "Sort disabled — use ORDER BY" : "Click to sort · right-click to hide"}
                                        style={{ opacity: isSortDisabled ? 0.4 : 1 }}
                                    >
                                        <span
                                            className="truncate text-[11px] font-semibold tracking-wide"
                                            style={{ color: isActiveSort ? "var(--accent)" : "var(--text-muted)" }}
                                        >
                                            {field}
                                        </span>
                                        {isActiveSort && (
                                            <span style={{ color: "var(--accent)", flexShrink: 0, fontSize: 10 }}>
                                                {activeSortDirection === "asc" ? "↑" : "↓"}
                                            </span>
                                        )}
                                        {colType && (
                                            <span
                                                className="text-[10px] ml-auto"
                                                style={{ color: "var(--text-dim)" }}
                                            >
                                                {colType}
                                            </span>
                                        )}
                                    </div>
                                    {/* Resize handle */}
                                    <div
                                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors"
                                        style={{ background: resizingColumn === field ? "var(--cyan)" : "transparent" }}
                                        onMouseDown={(e) => startResize(field, e)}
                                        onMouseEnter={(e) => { if (resizingColumn !== field) (e.currentTarget as HTMLElement).style.background = "rgba(0,229,255,0.3)"; }}
                                        onMouseLeave={(e) => { if (resizingColumn !== field) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                        title="Drag to resize"
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Body ───────────────────────────────────────────── */}
                    <div className="relative" style={{ height: `${cappedRows.length * ROW_HEIGHT}px` }}>
                        {cappedRows.slice(visibleRange.start, visibleRange.end).map((row, idx) => {
                            const rowIdx = visibleRange.start + idx;
                            const rowBg = rowIdx % 2 === 0 ? "var(--bg)" : "rgba(255,255,255,0.012)";

                            return (
                                <div
                                    key={rowIdx}
                                    className="absolute flex group/row"
                                    style={{
                                        top: `${rowIdx * ROW_HEIGHT}px`,
                                        height: `${ROW_HEIGHT}px`,
                                        minWidth: "100%",
                                        background: rowBg,
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,229,255,0.04)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                                >
                                    {/* Row number — sticky left */}
                                    <div
                                        className="sticky left-0 z-10 flex-shrink-0 flex items-center justify-center select-none"
                                        style={{
                                            width: ROW_NUM_WIDTH,
                                            minWidth: ROW_NUM_WIDTH,
                                            fontSize: 10,
                                            color: "var(--text-dim)",
                                            background: "inherit",
                                            borderRight: "1px solid #1a2840",
                                            borderBottom: "1px solid #1a2840",
                                        }}
                                    >
                                        {rowIdx + 1}
                                    </div>

                                    {/* Actions — sticky after row numbers, visible on hover */}
                                    <div
                                        className="flex-shrink-0 flex items-center gap-1 justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
                                        style={{
                                            width: readOnly ? 100 : 150,
                                            minWidth: readOnly ? 100 : 150,
                                            background: "inherit",
                                            borderRight: "1px solid #1a2840",
                                            borderBottom: "1px solid #1a2840",
                                        }}
                                    >
                                        <button
                                            onClick={() => setExpandedRow(row)}
                                            className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide border transition-all hover:border-current"
                                            style={{ color: "var(--accent)", borderColor: "rgba(0,255,136,0.3)" }}
                                            title="View all fields"
                                        >
                                            view
                                        </button>
                                        <button
                                            onClick={() => copyRowAsJSON(row)}
                                            className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide border transition-all hover:border-current"
                                            style={{ color: "var(--text-muted)", borderColor: "var(--border-bright)" }}
                                            title="Copy row as JSON"
                                        >
                                            copy
                                        </button>
                                        {!readOnly && onDeleteRow && (
                                            <button
                                                onClick={() => onDeleteRow(row)}
                                                className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide border transition-all hover:border-current"
                                                style={{ color: "var(--error)", borderColor: "rgba(255,45,85,0.3)" }}
                                                title="Delete row"
                                            >
                                                del
                                            </button>
                                        )}
                                    </div>

                                    {/* Data cells */}
                                    {visibleFields.map((field, fieldIdx) => {
                                        const cellId = `${rowIdx}-${field}`;
                                        const value = row[field];
                                        const isNull = value === null;
                                        const displayValue = isNull
                                            ? "null"
                                            : typeof value === "object"
                                              ? JSON.stringify(value)
                                              : String(value);
                                        const isLastField = fieldIdx === visibleFields.length - 1;
                                        const colW = effectiveColumnWidths[field] || 180;
                                        // Truncation: chars-per-pixel ~0.13 at 12px mono
                                        const isTruncated = !isNull && displayValue.length > Math.floor(colW * 0.13);

                                        return (
                                            <div
                                                key={field}
                                                className="text-[12px] whitespace-nowrap group/cell relative flex items-center flex-shrink-0"
                                                style={{
                                                    width: colW,
                                                    minWidth: colW,
                                                    height: "100%",
                                                    borderBottom: "1px solid var(--grid-line)",
                                                    borderRight: isLastField ? "none" : "1px solid var(--grid-line)",
                                                }}
                                            >
                                                {/* Cell text with truncation fade */}
                                                <div
                                                    className="relative flex-1 overflow-hidden px-3"
                                                    style={{ height: "100%", display: "flex", alignItems: "center" }}
                                                >
                                                    <span
                                                        className="truncate w-full text-left cursor-default"
                                                        style={{
                                                            fontFamily: "var(--font-mono)",
                                                            color: isNull ? "var(--text-dim)" : "var(--text-primary)",
                                                            fontStyle: isNull ? "italic" : "normal",
                                                        }}
                                                        title={isNull ? "NULL" : displayValue}
                                                        onDoubleClick={() => !isNull && setExpandedCell({ row, field, value })}
                                                    >
                                                        {displayValue}
                                                    </span>
                                                    {/* Truncation fade + expand hint */}
                                                    {isTruncated && (
                                                        <div
                                                            className="absolute right-0 top-0 h-full flex items-center pr-1 pointer-events-none"
                                                            style={{
                                                                background: "linear-gradient(to right, transparent, var(--bg) 60%)",
                                                                width: 32,
                                                            }}
                                                        >
                                                            <svg
                                                                width="10" height="10" viewBox="0 0 10 10" fill="none"
                                                                stroke="var(--text-dim)" strokeWidth="1.2" strokeLinecap="round"
                                                                style={{ marginLeft: "auto" }}
                                                            >
                                                                <path d="M1 5h8M6 2l3 3-3 3" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Copy button on hover */}
                                                {!isNull && (
                                                    <button
                                                        onClick={() => copyToClipboard(displayValue, cellId)}
                                                        className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex-shrink-0 mr-1"
                                                        style={{
                                                            color: copiedCell === cellId ? "var(--accent)" : "var(--text-muted)",
                                                            background: "none",
                                                            border: "none",
                                                            padding: "2px",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                        }}
                                                        title="Copy cell value"
                                                    >
                                                        {copiedCell === cellId ? (
                                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="2,6 5,9 10,3" />
                                                            </svg>
                                                        ) : (
                                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <rect x="4" y="1" width="7" height="8" />
                                                                <path d="M1 4v7h7" strokeOpacity="0.5" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
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
                                    className="px-3 py-1.5 text-[11px] uppercase border rounded hover:opacity-80 transition-opacity font-medium"
                                    style={{
                                        borderColor: "var(--border)",
                                        color: "var(--text-secondary)",
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

            {/* Expanded Row Modal */}
            {expandedRow && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0, 0, 0, 0.8)" }}
                    onClick={() => setExpandedRow(null)}
                >
                    <div
                        className="max-w-6xl w-full max-h-[90vh] overflow-auto border rounded-lg shadow-2xl"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="sticky top-0 z-10 px-8 py-5 border-b flex items-center justify-between backdrop-blur-sm"
                            style={{
                                background: "var(--panel)",
                                borderColor: "var(--border)",
                            }}
                        >
                            <div
                                className="text-[13px] uppercase tracking-wide font-bold"
                                style={{ color: "var(--text-muted)" }}
                            >
                                Row Details • {result?.fields.length || 0}{" "}
                                fields
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        copyToClipboard(
                                            JSON.stringify(
                                                expandedRow,
                                                null,
                                                2,
                                            ),
                                            "expanded-row",
                                        );
                                    }}
                                    className="px-4 py-2 text-[11px] uppercase border rounded hover:opacity-80 transition-opacity font-semibold"
                                    style={{
                                        borderColor: "var(--border)",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {copiedCell === "expanded-row"
                                        ? "✓ COPIED"
                                        : "COPY JSON"}
                                </button>
                                <button
                                    onClick={() => setExpandedRow(null)}
                                    className="px-4 py-2 text-[11px] uppercase border rounded hover:opacity-70 transition-opacity"
                                    style={{
                                        borderColor: "var(--border)",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    CLOSE (ESC)
                                </button>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="space-y-6">
                                {result?.fields.map((field) => {
                                    const value = expandedRow[field];
                                    const isHidden = hiddenColumns.has(field);
                                    return (
                                        <div
                                            key={field}
                                            className="border rounded-lg p-5"
                                            style={{
                                                borderColor: "var(--border)",
                                                opacity: isHidden ? 0.5 : 1,
                                                background: "var(--bg)",
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-4 mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="text-[13px] font-mono font-bold"
                                                        style={{
                                                            color: "var(--accent)",
                                                        }}
                                                    >
                                                        {field}
                                                    </div>
                                                    {isHidden && (
                                                        <span
                                                            className="text-[9px] px-2 py-1 rounded font-semibold uppercase tracking-wide"
                                                            style={{
                                                                background:
                                                                    "var(--border)",
                                                                color: "var(--text-muted)",
                                                            }}
                                                        >
                                                            HIDDEN
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const cellValue =
                                                            value === null
                                                                ? "NULL"
                                                                : String(value);
                                                        copyToClipboard(
                                                            cellValue,
                                                            `row-field-${field}`,
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 text-[10px] uppercase border rounded hover:opacity-80 transition-opacity flex-shrink-0 font-semibold"
                                                    style={{
                                                        borderColor:
                                                            "var(--border)",
                                                        color: "var(--text-secondary)",
                                                    }}
                                                >
                                                    {copiedCell ===
                                                    `row-field-${field}`
                                                        ? "✓"
                                                        : "COPY"}
                                                </button>
                                            </div>
                                            <JSONViewer value={value} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
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

        // If value is already an object, stringify it directly
        if (typeof value === "object") {
            const jsonString = JSON.stringify(value, null, 2);
            return <div>{jsonString}</div>;
        }

        // Try to parse if it's a JSON string
        const valueStr = String(value);
        let displayContent = valueStr;

        try {
            const parsed = JSON.parse(valueStr);
            displayContent = JSON.stringify(parsed, null, 2);
        } catch {
            // Not JSON, use as-is
        }

        return <div>{displayContent}</div>;
    }, [value]);

    return (
        <div
            className="p-5 text-[14px] font-mono whitespace-pre-wrap break-words rounded border"
            style={{
                background: "var(--panel)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
                lineHeight: "1.6",
            }}
        >
            {content}
        </div>
    );
});

JSONViewer.displayName = "JSONViewer";
