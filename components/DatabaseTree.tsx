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
    databases: string[];
    selectedDatabase: string;
    tableColumns: Record<string, Column[]>;
    onTablePreview: (table: Table) => void;
    loading: boolean;
}

export default function DatabaseTree({
    databases,
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
        <div className="flex flex-col h-full">
            {/* Schema Browser Header */}
            <div className="p-3 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Schema Browser
                </h2>
                {selectedDatabase && (
                    <p className="text-xs text-gray-400 mt-1 font-mono">
                        {selectedDatabase}
                        <span className="text-gray-600 ml-2">
                            {Object.keys(groupedTables).reduce(
                                (sum, schema) =>
                                    sum + groupedTables[schema].length,
                                0,
                            )}{" "}
                            tables
                        </span>
                    </p>
                )}
            </div>

            {/* Tables Tree */}
            <div className="flex-1 overflow-auto p-2">
                {loading && (
                    <p className="text-xs text-gray-600 px-2 py-1">
                        Loading...
                    </p>
                )}
                {!loading && Object.keys(groupedTables).length === 0 && (
                    <p className="text-xs text-gray-600 italic px-2 py-1">
                        No tables found
                    </p>
                )}

                {Object.entries(groupedTables).map(([schema, tables]) => (
                    <div key={schema} className="mb-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1 mb-1">
                            {schema === "public" ? "Tables" : schema}
                        </div>
                        <div className="space-y-0.5">
                            {tables.map((table) => {
                                const tableKey = `${table.schema}.${table.name}`;
                                const isExpanded = expandedTables.has(tableKey);
                                const columns = tableColumns[tableKey] || [];

                                return (
                                    <div key={tableKey}>
                                        <div className="flex items-center gap-1 group">
                                            <button
                                                onClick={() =>
                                                    toggleTable(tableKey)
                                                }
                                                className="p-1 hover:bg-gray-800 rounded flex-shrink-0"
                                            >
                                                <svg
                                                    className={`w-3 h-3 text-gray-500 transition-transform ${
                                                        isExpanded
                                                            ? "rotate-90"
                                                            : ""
                                                    }`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 5l7 7-7 7"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() =>
                                                    onTablePreview(table)
                                                }
                                                className="flex-1 text-left px-2 py-1 rounded text-sm text-gray-300
                                                   hover:bg-gray-800 hover:text-blue-400 transition-colors
                                                   flex items-center gap-2 min-w-0"
                                                title="Click to preview data"
                                            >
                                                <svg
                                                    className="w-3.5 h-3.5 flex-shrink-0 text-gray-600"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                    />
                                                </svg>
                                                <span className="font-mono truncate">
                                                    {table.name}
                                                </span>
                                                <span className="text-[10px] text-gray-600 flex-shrink-0">
                                                    ({columns.length})
                                                </span>
                                            </button>
                                        </div>

                                        {isExpanded && (
                                            <div className="ml-8 mt-0.5 space-y-0.5 border-l border-gray-800 pl-2">
                                                {columns.map((col) => (
                                                    <div
                                                        key={col.name}
                                                        className="px-2 py-0.5 text-xs text-gray-400 font-mono
                                                           hover:bg-gray-800/50 rounded flex items-center justify-between gap-2"
                                                        title={`${col.type}${col.nullable === "YES" ? " NULL" : " NOT NULL"}`}
                                                    >
                                                        <span className="truncate">
                                                            {col.name}
                                                        </span>
                                                        <span className="text-[10px] text-gray-600 flex-shrink-0">
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
