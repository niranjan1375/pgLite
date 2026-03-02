"use client";

import { useState } from "react";

interface Column {
    name: string;
    type: string;
    nullable: string;
}

interface Table {
    schema: string;
    name: string;
}

interface DatabaseTreeProps {
    selectedDatabase: string;
    tableColumns: Record<string, Column[]>;
    onTablePreview: (table: Table) => void;
    loading: boolean;
}

export default function DatabaseTree({
    selectedDatabase,
    tableColumns,
    onTablePreview,
    loading,
}: DatabaseTreeProps) {
    const [expandedTables, setExpandedTables] = useState<Set<string>>(
        new Set(),
    );

    const toggleTable = (tableKey: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableKey)) {
            newExpanded.delete(tableKey);
        } else {
            newExpanded.add(tableKey);
        }
        setExpandedTables(newExpanded);
    };

    const groupedTables: Record<string, Table[]> = {};
    Object.keys(tableColumns).forEach((tableKey) => {
        const [schema, name] = tableKey.split(".");
        if (!groupedTables[schema]) {
            groupedTables[schema] = [];
        }
        groupedTables[schema].push({ schema, name });
    });

    return (
        <div
            className="flex flex-col h-full"
            style={{ background: "var(--bg)" }}
        >
            {/* Schema Browser Header */}
            <div
                className="px-3 py-2 border-b"
                style={{
                    borderColor: "var(--border)",
                    background: "var(--panel)",
                }}
            >
                <h2
                    className="text-[11px] uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                >
                    Schema
                </h2>
                {selectedDatabase && (
                    <p
                        className="text-[11px] mt-1"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {selectedDatabase}
                        <span
                            className="ml-2"
                            style={{ color: "var(--text-muted)" }}
                        >
                            {Object.keys(groupedTables).reduce(
                                (sum, schema) =>
                                    sum + groupedTables[schema].length,
                                0,
                            )}{" "}
                            TABLES
                        </span>
                    </p>
                )}
            </div>

            {/* Tables Tree */}
            <div className="flex-1 overflow-auto p-1">
                {loading && (
                    <p
                        className="text-[11px] px-2 py-1 uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                    >
                        Loading...
                    </p>
                )}
                {!loading && Object.keys(groupedTables).length === 0 && (
                    <p
                        className="text-[11px] px-2 py-1 uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                    >
                        No tables
                    </p>
                )}

                {Object.entries(groupedTables).map(([schema, tables]) => (
                    <div key={schema} className="mb-2">
                        <div
                            className="text-[10px] uppercase tracking-wider px-2 py-1"
                            style={{ color: "var(--text-muted)" }}
                        >
                            {schema === "public"
                                ? "TABLES"
                                : schema.toUpperCase()}
                        </div>
                        <div className="space-y-px">
                            {tables.map((table) => {
                                const tableKey = `${table.schema}.${table.name}`;
                                const isExpanded = expandedTables.has(tableKey);
                                const columns = tableColumns[tableKey] || [];

                                return (
                                    <div key={tableKey}>
                                        <div className="flex items-center group">
                                            <button
                                                onClick={() =>
                                                    toggleTable(tableKey)
                                                }
                                                className="p-1 hover:opacity-70 transition-opacity flex-shrink-0"
                                                style={{
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                <span
                                                    className={`text-[10px] transition-transform inline-block ${
                                                        isExpanded
                                                            ? "rotate-90"
                                                            : ""
                                                    }`}
                                                    style={{
                                                        transformOrigin:
                                                            "center",
                                                    }}
                                                >
                                                    ►
                                                </span>
                                            </button>
                                            <button
                                                onClick={() =>
                                                    onTablePreview(table)
                                                }
                                                className="flex-1 text-left px-2 py-1 text-[12px] transition-colors
                                                   flex items-center gap-2 min-w-0"
                                                style={{
                                                    color: "var(--text-primary)",
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background =
                                                        "var(--panel)";
                                                    e.currentTarget.style.color =
                                                        "var(--accent)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background =
                                                        "transparent";
                                                    e.currentTarget.style.color =
                                                        "var(--text-primary)";
                                                }}
                                                title="Preview table data"
                                            >
                                                <span
                                                    className="flex-shrink-0 text-[11px]"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    ▦
                                                </span>
                                                <span className="truncate">
                                                    {table.name}
                                                </span>
                                                <span
                                                    className="text-[10px] flex-shrink-0"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    {columns.length}
                                                </span>
                                            </button>
                                        </div>

                                        {isExpanded && (
                                            <div
                                                className="ml-6 space-y-px border-l pl-2"
                                                style={{
                                                    borderColor:
                                                        "var(--grid-line)",
                                                }}
                                            >
                                                {columns.map((col) => (
                                                    <div
                                                        key={col.name}
                                                        className="px-2 py-0.5 text-[11px] transition-colors
                                                           flex items-center justify-between gap-2"
                                                        style={{
                                                            color: "var(--text-secondary)",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background =
                                                                "var(--panel)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background =
                                                                "transparent";
                                                        }}
                                                        title={`${col.type}${col.nullable === "YES" ? " NULL" : " NOT NULL"}`}
                                                    >
                                                        <span className="truncate">
                                                            {col.name}
                                                        </span>
                                                        <span
                                                            className="text-[10px] flex-shrink-0"
                                                            style={{
                                                                color: "var(--text-muted)",
                                                            }}
                                                        >
                                                            {col.type}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
