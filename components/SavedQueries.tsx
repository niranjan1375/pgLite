"use client";

import { useMemo, useState } from "react";
import { useKeyboard } from "@/hooks/useKeyboard";
import { type SavedQuery } from "@/lib/queryStorage";

interface SavedQueriesProps {
    items: SavedQuery[];
    isOpen: boolean;
    onToggle: () => void;
    onSelectQuery: (query: SavedQuery) => void;
    onDeleteItem: (id: string) => void;
    onToggleStar: (id: string) => void;
}

function buildPreview(query: string): string {
    return query.replace(/\s+/g, " ").trim();
}

function formatTimestamp(timestamp: number): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

export default function SavedQueries({
    items,
    isOpen,
    onToggle,
    onSelectQuery,
    onDeleteItem,
    onToggleStar,
}: SavedQueriesProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [showStarredOnly, setShowStarredOnly] = useState(false);

    useKeyboard([
        {
            key: "j",
            ctrl: true,
            description: "Toggle saved queries",
            handler: onToggle,
        },
    ]);

    const filteredItems = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();

        return items.filter((item) => {
            if (showStarredOnly && !item.starred) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const haystacks = [
                item.name,
                item.query,
                item.folder,
                item.environment,
                item.database,
                item.tags.join(" "),
            ];

            return haystacks.some((value) =>
                value.toLowerCase().includes(normalizedSearch),
            );
        });
    }, [items, searchQuery, showStarredOnly]);

    const groupedItems = useMemo(() => {
        const groups = new Map<string, SavedQuery[]>();

        filteredItems.forEach((item) => {
            const label = item.folder || "Unfiled";
            const group = groups.get(label) || [];
            group.push(item);
            groups.set(label, group);
        });

        return Array.from(groups.entries()).sort(([left], [right]) =>
            left.localeCompare(right),
        );
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
                            Saved Queries
                        </h2>
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {items.length} stored snippets
                        </p>
                    </div>
                    <button
                        onClick={onToggle}
                        className="text-[12px] hover:opacity-70 transition-opacity"
                        style={{ color: "var(--text-muted)" }}
                        title="Hide saved queries (Cmd/Ctrl+J)"
                    >
                        x
                    </button>
                </div>

                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search saved queries..."
                    className="w-full mt-3 text-[11px] px-2 py-1.5 rounded border outline-none"
                    style={{
                        background: "var(--bg)",
                        borderColor: "var(--border)",
                        color: "var(--text-primary)",
                    }}
                />

                <label
                    className="mt-3 flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--text-secondary)" }}
                >
                    <input
                        type="checkbox"
                        checked={showStarredOnly}
                        onChange={(e) => setShowStarredOnly(e.target.checked)}
                    />
                    Starred only
                </label>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                {groupedItems.length === 0 ? (
                    <div
                        className="text-[11px] px-2 py-4"
                        style={{ color: "var(--text-muted)" }}
                    >
                        No saved queries yet.
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
                                {groupItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="border rounded px-2 py-2"
                                        style={{
                                            background: "var(--bg)",
                                            borderColor: item.starred
                                                ? "var(--warning)"
                                                : "var(--border)",
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onSelectQuery(item)
                                                }
                                                className="min-w-0 flex-1 text-left hover:opacity-85 transition-opacity"
                                                title={item.query}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="text-[11px] leading-5 truncate"
                                                        style={{
                                                            color: "var(--text-primary)",
                                                        }}
                                                    >
                                                        {item.name}
                                                    </span>
                                                    {item.starred && (
                                                        <span
                                                            className="text-[10px]"
                                                            style={{
                                                                color: "var(--warning)",
                                                            }}
                                                        >
                                                            ★
                                                        </span>
                                                    )}
                                                </div>
                                                <div
                                                    className="text-[10px] mt-1 line-clamp-2"
                                                    style={{
                                                        color: "var(--text-secondary)",
                                                        fontFamily: "var(--font-mono)",
                                                    }}
                                                >
                                                    {buildPreview(item.query) ||
                                                        "(empty query)"}
                                                </div>
                                                <div
                                                    className="text-[10px] mt-1 flex flex-wrap gap-2"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    <span>
                                                        {item.environment}
                                                    </span>
                                                    <span>•</span>
                                                    <span>
                                                        {item.database ||
                                                            "workspace"}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{item.mode}</span>
                                                    <span>•</span>
                                                    <span>
                                                        {formatTimestamp(
                                                            item.updatedAt,
                                                        )}
                                                    </span>
                                                </div>
                                                {item.tags.length > 0 && (
                                                    <div
                                                        className="text-[10px] mt-1 flex flex-wrap gap-1"
                                                        style={{
                                                            color: "var(--accent)",
                                                        }}
                                                    >
                                                        {item.tags.map(
                                                            (tag) => (
                                                                <span key={tag}>
                                                                    #{tag}
                                                                </span>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </button>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onToggleStar(item.id)
                                                    }
                                                    className="text-[11px] px-1 hover:opacity-70 transition-opacity"
                                                    style={{
                                                        color: item.starred
                                                            ? "var(--warning)"
                                                            : "var(--text-muted)",
                                                    }}
                                                    title={
                                                        item.starred
                                                            ? "Unstar query"
                                                            : "Star query"
                                                    }
                                                >
                                                    ★
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
                                                    title="Delete saved query"
                                                >
                                                    x
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
