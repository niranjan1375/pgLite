"use client";

import { useMemo, useState } from "react";
import { useKeyboard } from "@/hooks/useKeyboard";

export interface QueryHistoryItem {
    id: string;
    query: string;
    database: string;
    environment: string;
    timestamp: number;
    executionTime?: number;
    rowCount?: number;
    success: boolean;
    error?: string;
}

interface QueryHistoryProps {
    items: QueryHistoryItem[];
    isOpen: boolean;
    onToggle: () => void;
    onSelectQuery: (query: string) => void;
    onDeleteItem: (id: string) => void;
    onClear: () => void;
}

function getDateGroupLabel(timestamp: number): string {
    const now = new Date();
    const date = new Date(timestamp);
    const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );
    const startOfItemDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );

    const diffDays = Math.round(
        (startOfToday.getTime() - startOfItemDay.getTime()) / 86_400_000,
    );

    if (diffDays === 0) {
        return "Today";
    }

    if (diffDays === 1) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(date);
}

function formatTimestamp(timestamp: number): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

function formatRowCount(rowCount?: number): string | null {
    if (typeof rowCount !== "number") {
        return null;
    }

    return `${rowCount.toLocaleString()} rows`;
}

function buildPreview(query: string): string {
    return query.replace(/\s+/g, " ").trim();
}

export default function QueryHistory({
    items,
    isOpen,
    onToggle,
    onSelectQuery,
    onDeleteItem,
    onClear,
}: QueryHistoryProps) {
    const [searchQuery, setSearchQuery] = useState("");

    useKeyboard([
        {
            key: "h",
            ctrl: true,
            description: "Toggle query history",
            handler: onToggle,
        },
    ]);

    const filteredItems = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        if (!normalizedSearch) {
            return items;
        }

        return items.filter((item) => {
            const haystacks = [
                item.query,
                item.database,
                item.environment,
                item.error || "",
            ];

            return haystacks.some((value) =>
                value.toLowerCase().includes(normalizedSearch),
            );
        });
    }, [items, searchQuery]);

    const groupedItems = useMemo(() => {
        const groups = new Map<string, QueryHistoryItem[]>();

        filteredItems.forEach((item) => {
            const label = getDateGroupLabel(item.timestamp);
            const group = groups.get(label) || [];
            group.push(item);
            groups.set(label, group);
        });

        return Array.from(groups.entries());
    }, [filteredItems]);

    if (!isOpen) {
        return null;
    }

    return (
        <aside
            className="w-[320px] flex-shrink-0 border-l flex flex-col min-h-0"
            style={{
                background: "var(--panel)",
                borderColor: "var(--border)",
            }}
        >
            <div
                className="px-3 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2
                            className="text-[11px] uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Query History
                        </h2>
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {items.length} saved queries
                        </p>
                    </div>
                    <button
                        onClick={onToggle}
                        className="text-[12px] hover:opacity-70 transition-opacity"
                        style={{ color: "var(--text-muted)" }}
                        title="Hide query history (Cmd/Ctrl+H)"
                    >
                        x
                    </button>
                </div>

                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search history..."
                    className="w-full mt-3 text-[11px] px-2 py-1.5 rounded border outline-none"
                    style={{
                        background: "var(--bg)",
                        borderColor: "var(--border)",
                        color: "var(--text-primary)",
                    }}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                {groupedItems.length === 0 ? (
                    <div
                        className="text-[11px] px-2 py-4"
                        style={{ color: "var(--text-muted)" }}
                    >
                        No query history yet.
                    </div>
                ) : (
                    groupedItems.map(([label, groupItems]) => (
                        <div key={label} className="mb-4">
                            <div
                                className="px-2 py-1 text-[10px] uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {label}
                            </div>
                            <div className="flex flex-col gap-2">
                                {groupItems.map((item) => {
                                    const preview = buildPreview(item.query);
                                    const rowCount = formatRowCount(
                                        item.rowCount,
                                    );

                                    return (
                                        <div
                                            key={item.id}
                                            className="border rounded px-2 py-2"
                                            style={{
                                                background: "var(--bg)",
                                                borderColor: item.success
                                                    ? "var(--border)"
                                                    : "var(--error)",
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onSelectQuery(
                                                            item.query,
                                                        )
                                                    }
                                                    className="min-w-0 flex-1 text-left hover:opacity-85 transition-opacity"
                                                    title={item.query}
                                                >
                                                    <div
                                                        className="text-[11px] leading-5 truncate"
                                                        style={{
                                                            color: "var(--text-primary)",
                                                            fontFamily: "var(--font-mono)",
                                                        }}
                                                    >
                                                        {preview ||
                                                            "(empty query)"}
                                                    </div>
                                                    <div
                                                        className="text-[10px] mt-1"
                                                        style={{
                                                            color: "var(--text-secondary)",
                                                        }}
                                                    >
                                                        {item.environment} •{" "}
                                                        {item.database} •{" "}
                                                        {formatTimestamp(
                                                            item.timestamp,
                                                        )}
                                                    </div>
                                                    <div
                                                        className="text-[10px] mt-1 flex flex-wrap gap-2"
                                                        style={{
                                                            color: item.success
                                                                ? "var(--text-muted)"
                                                                : "var(--error)",
                                                        }}
                                                    >
                                                        <span>
                                                            {item.success
                                                                ? "SUCCESS"
                                                                : "FAILED"}
                                                        </span>
                                                        {typeof item.executionTime ===
                                                            "number" && (
                                                            <span>
                                                                {
                                                                    item.executionTime
                                                                }
                                                                ms
                                                            </span>
                                                        )}
                                                        {rowCount && (
                                                            <span>
                                                                {rowCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {!item.success &&
                                                        item.error && (
                                                            <div
                                                                className="text-[10px] mt-1 line-clamp-2"
                                                                style={{
                                                                    color: "var(--error)",
                                                                }}
                                                            >
                                                                {item.error}
                                                            </div>
                                                        )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onDeleteItem(item.id)
                                                    }
                                                    className="text-[11px] px-1 hover:opacity-70 transition-opacity"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                    title="Delete history item"
                                                >
                                                    x
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {items.length > 0 && (
                <div
                    className="px-3 py-2 border-t"
                    style={{ borderColor: "var(--border)" }}
                >
                    <button
                        onClick={onClear}
                        className="w-full text-[11px] py-1.5 hover:opacity-80 transition-opacity"
                        style={{ color: "var(--warning)" }}
                    >
                        Clear History
                    </button>
                </div>
            )}
        </aside>
    );
}
