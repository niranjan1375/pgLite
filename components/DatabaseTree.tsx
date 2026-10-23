"use client";

import { useMemo, useState } from "react";

interface Column {
    name: string;
    type: string;
    nullable: string;
}

interface Table {
    schema: string;
    name: string;
    database?: string; // For workspace mode
    primaryKeys?: string[];
}

interface WorkspaceSchema {
    database: string;
    schemas: {
        schema: string;
        tables: {
            name: string;
            primaryKeys?: string[];
            columns: Column[];
        }[];
    }[];
}

interface DatabaseTreeProps {
    selectedDatabase: string;
    tableColumns: Record<string, Column[]>;
    primaryKeysByTable?: Record<string, string[]>;
    onTablePreview: (table: Table) => void;
    templates?: string[];
    templatesLoading?: boolean;
    onTemplateOpen?: (name: string) => void;
    onRefresh?: () => void;
    loading: boolean;
    workspaceMode?: boolean;
    workspaceSchemas?: WorkspaceSchema[];
}

export default function DatabaseTree({
    selectedDatabase,
    tableColumns,
    primaryKeysByTable = {},
    onTablePreview,
    templates = [],
    templatesLoading = false,
    onTemplateOpen,
    onRefresh,
    loading,
    workspaceMode = false,
    workspaceSchemas = [],
}: DatabaseTreeProps) {
    const Icon = ({
        type,
    }: {
        type: "database" | "schema" | "table" | "column";
    }) => {
        const common = {
            width: 12,
            height: 12,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.8,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
        };

        if (type === "database") {
            return (
                <svg {...common}>
                    <ellipse cx="12" cy="5" rx="7" ry="3" />
                    <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
                    <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
                </svg>
            );
        }

        if (type === "schema") {
            return (
                <svg {...common}>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M9 10v10M15 10v10" />
                </svg>
            );
        }

        if (type === "table") {
            return (
                <svg {...common}>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M9 4v16" />
                </svg>
            );
        }

        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="3" />
            </svg>
        );
    };

    const [expandedTables, setExpandedTables] = useState<Set<string>>(
        new Set(),
    );
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
        new Set(),
    );
    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
        new Set(),
    );
    const [expandedStandardSchemas, setExpandedStandardSchemas] = useState<
        Set<string>
    >(new Set(["public"]));
    const [searchTerm, setSearchTerm] = useState("");
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const toggleTable = (tableKey: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableKey)) {
            newExpanded.delete(tableKey);
        } else {
            newExpanded.add(tableKey);
        }
        setExpandedTables(newExpanded);
    };

    const toggleDatabase = (dbName: string) => {
        const newExpanded = new Set(expandedDatabases);
        if (newExpanded.has(dbName)) {
            newExpanded.delete(dbName);
        } else {
            newExpanded.add(dbName);
        }
        setExpandedDatabases(newExpanded);
    };

    const toggleSchema = (key: string) => {
        const newExpanded = new Set(expandedSchemas);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedSchemas(newExpanded);
    };

    const toggleStandardSchema = (schema: string) => {
        const newExpanded = new Set(expandedStandardSchemas);
        if (newExpanded.has(schema)) {
            newExpanded.delete(schema);
        } else {
            newExpanded.add(schema);
        }
        setExpandedStandardSchemas(newExpanded);
    };

    // Group tables by schema for standard mode
    const groupedTables = useMemo<Record<string, Table[]>>(() => {
        const grouped: Record<string, Table[]> = {};
        if (!workspaceMode) {
            Object.keys(tableColumns).forEach((tableKey) => {
                const [schema, name] = tableKey.split(".");
                if (!grouped[schema]) {
                    grouped[schema] = [];
                }
                grouped[schema].push({
                    schema,
                    name,
                    primaryKeys: primaryKeysByTable[tableKey] || [],
                });
            });
        }
        return grouped;
    }, [workspaceMode, tableColumns, primaryKeysByTable]);

    const filteredWorkspaceSchemas = useMemo(() => {
        if (!workspaceMode || !normalizedSearch) return workspaceSchemas;

        return workspaceSchemas
            .map((db) => {
                const dbMatch = db.database
                    .toLowerCase()
                    .includes(normalizedSearch);
                const schemas = db.schemas
                    .map((schema) => {
                        const schemaMatch = schema.schema
                            .toLowerCase()
                            .includes(normalizedSearch);
                        const tables = schema.tables.filter((table) => {
                            if (dbMatch || schemaMatch) return true;
                            if (
                                table.name
                                    .toLowerCase()
                                    .includes(normalizedSearch)
                            ) {
                                return true;
                            }
                            return table.columns.some(
                                (col) =>
                                    col.name
                                        .toLowerCase()
                                        .includes(normalizedSearch) ||
                                    col.type
                                        .toLowerCase()
                                        .includes(normalizedSearch),
                            );
                        });

                        return { ...schema, tables };
                    })
                    .filter((schema) => schema.tables.length > 0);

                return { ...db, schemas };
            })
            .filter((db) => db.schemas.length > 0);
    }, [workspaceMode, workspaceSchemas, normalizedSearch]);

    const filteredGroupedTables = useMemo(() => {
        if (workspaceMode || !normalizedSearch) return groupedTables;

        const filtered: Record<string, Table[]> = {};

        Object.entries(groupedTables).forEach(([schema, tables]) => {
            const schemaMatch = schema.toLowerCase().includes(normalizedSearch);
            const nextTables = tables.filter((table) => {
                if (schemaMatch) return true;
                if (table.name.toLowerCase().includes(normalizedSearch)) {
                    return true;
                }

                const tableKey = `${table.schema}.${table.name}`;
                const columns = tableColumns[tableKey] || [];
                return columns.some(
                    (col) =>
                        col.name.toLowerCase().includes(normalizedSearch) ||
                        col.type.toLowerCase().includes(normalizedSearch),
                );
            });

            if (nextTables.length > 0) {
                filtered[schema] = nextTables;
            }
        });

        return filtered;
    }, [workspaceMode, groupedTables, tableColumns, normalizedSearch]);

    // Count total tables
    const totalTables = workspaceMode
        ? filteredWorkspaceSchemas.reduce(
              (sum, db) =>
                  sum +
                  db.schemas.reduce(
                      (schemaSum, schema) => schemaSum + schema.tables.length,
                      0,
                  ),
              0,
          )
        : Object.keys(filteredGroupedTables).reduce(
              (sum, schema) => sum + filteredGroupedTables[schema].length,
              0,
          );

    return (
        <div
            className="flex flex-col h-full"
            style={{ background: "var(--bg)" }}
        >
            {/* Header */}
            <div
                className="px-3 py-2.5 border-b flex justify-between items-center flex-shrink-0"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span
                            className="text-[10px] uppercase tracking-[0.18em] font-bold"
                            style={{ color: "var(--text-muted)" }}
                        >
                            {workspaceMode ? "explorer" : "schema"}
                        </span>
                        {workspaceMode && (
                            <span
                                className="px-1 text-[9px] border font-bold tracking-widest"
                                style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
                            >
                                WS
                            </span>
                        )}
                    </div>
                    {!workspaceMode && selectedDatabase && (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                                {selectedDatabase}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                {totalTables} tables
                            </span>
                        </div>
                    )}
                    {workspaceMode && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                {workspaceSchemas.length} dbs · {totalTables} tables
                            </span>
                        </div>
                    )}
                </div>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="flex items-center justify-center transition-all disabled:opacity-30"
                        style={{ color: loading ? "var(--text-dim)" : "var(--accent)" }}
                        title="Refresh schema"
                    >
                        <svg
                            width="14" height="14" viewBox="0 0 14 14" fill="none"
                            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                            className={loading ? "animate-spin" : ""}
                        >
                            <path d="M13 7A6 6 0 1 1 7 1" />
                            <polyline points="10,1 13,1 13,4" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Search */}
            <div
                className="px-2 py-2 border-b flex-shrink-0"
                style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
                <div className="relative flex items-center">
                    <svg
                        className="absolute left-2 pointer-events-none"
                        width="11" height="11" viewBox="0 0 11 11" fill="none"
                        stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round"
                    >
                        <circle cx="4.5" cy="4.5" r="3.5" />
                        <line x1="7.5" y1="7.5" x2="10" y2="10" />
                    </svg>
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="search tables, columns…"
                        className="w-full text-[11px] pl-7 pr-2 py-1.5 border outline-none"
                        style={{
                            background: "var(--bg)",
                            color: "var(--text-primary)",
                            borderColor: searchTerm ? "rgba(0,229,255,0.3)" : "var(--border)",
                        }}
                    />
                </div>
            </div>

            {workspaceMode && (
                <div
                    className="px-2 py-2 border-b"
                    style={{
                        borderColor: "var(--border)",
                        background: "var(--panel)",
                    }}
                >
                    <div
                        className="text-[10px] uppercase tracking-wider px-1 mb-1"
                        style={{ color: "var(--text-muted)" }}
                    >
                        Templates
                    </div>
                    <div className="max-h-32 overflow-auto space-y-0.5">
                        {templatesLoading && (
                            <p
                                className="text-[11px] px-1 py-1"
                                style={{ color: "var(--text-muted)" }}
                            >
                                Loading templates...
                            </p>
                        )}
                        {!templatesLoading && templates.length === 0 && (
                            <p
                                className="text-[11px] px-1 py-1"
                                style={{ color: "var(--text-muted)" }}
                            >
                                No templates
                            </p>
                        )}
                        {!templatesLoading &&
                            templates.map((template) => (
                                <button
                                    key={template}
                                    onClick={() => onTemplateOpen?.(template)}
                                    className="w-full text-left px-2 py-1 text-[11px] rounded hover:opacity-80"
                                    style={{
                                        color: "var(--text-primary)",
                                        background: "var(--bg)",
                                        border: "1px solid var(--border)",
                                    }}
                                    title={`Open template ${template}`}
                                >
                                    {template}
                                </button>
                            ))}
                    </div>
                </div>
            )}

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

                {/* Workspace Mode - Show all databases */}
                {workspaceMode && !loading && workspaceSchemas.length === 0 && (
                    <p
                        className="text-[11px] px-2 py-1 uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                    >
                        No schemas
                    </p>
                )}

                {workspaceMode &&
                    !loading &&
                    filteredWorkspaceSchemas.map((dbInfo) => {
                        const isDbExpanded = expandedDatabases.has(
                            dbInfo.database,
                        );

                        return (
                            <div key={dbInfo.database} className="mb-1">
                                {/* Database Header */}
                                <button
                                    onClick={() => toggleDatabase(dbInfo.database)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium transition-colors"
                                    style={{ color: "var(--text-secondary)" }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-elevated)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                >
                                    <svg
                                        width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                                        style={{ flexShrink: 0, color: "var(--text-dim)", transition: "transform 0.15s", transform: isDbExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                    >
                                        <polygon points="0,0 8,4 0,8" />
                                    </svg>
                                    <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                                        <Icon type="database" />
                                    </span>
                                    <span>{dbInfo.database}</span>
                                    <span
                                        className="text-[10px] ml-auto"
                                        style={{ color: "var(--text-muted)" }}
                                    >
                                        (
                                        {dbInfo.schemas.reduce(
                                            (sum, s) => sum + s.tables.length,
                                            0,
                                        )}
                                        )
                                    </span>
                                </button>

                                {/* Schemas under this database */}
                                {isDbExpanded &&
                                    dbInfo.schemas.map((schemaInfo) => {
                                        const schemaKey = `${dbInfo.database}.${schemaInfo.schema}`;
                                        const isSchemaExpanded =
                                            expandedSchemas.has(schemaKey);

                                        return (
                                            <div
                                                key={schemaKey}
                                                className="ml-3 border-l pl-2"
                                                style={{
                                                    borderColor:
                                                        "var(--grid-line)",
                                                }}
                                            >
                                                {/* Schema Header */}
                                                <button
                                                    onClick={() => toggleSchema(schemaKey)}
                                                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] transition-colors"
                                                    style={{ color: "var(--text-muted)" }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                                                >
                                                    <svg
                                                        width="6" height="6" viewBox="0 0 8 8" fill="currentColor"
                                                        style={{ flexShrink: 0, transition: "transform 0.15s", transform: isSchemaExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                    >
                                                        <polygon points="0,0 8,4 0,8" />
                                                    </svg>
                                                    <Icon type="schema" />
                                                    <span>
                                                        {schemaInfo.schema === "public" ? "tables" : schemaInfo.schema}
                                                    </span>
                                                    <span className="ml-auto" style={{ color: "var(--text-dim)" }}>
                                                        {schemaInfo.tables.length}
                                                    </span>
                                                </button>

                                                {/* Tables under this schema */}
                                                {isSchemaExpanded && (
                                                    <div
                                                        className="ml-3 space-y-px border-l pl-2"
                                                        style={{
                                                            borderColor:
                                                                "var(--grid-line)",
                                                        }}
                                                    >
                                                        {schemaInfo.tables.map(
                                                            (tableInfo) => {
                                                                const tableKey = `${dbInfo.database}.${schemaInfo.schema}.${tableInfo.name}`;
                                                                const isExpanded =
                                                                    expandedTables.has(
                                                                        tableKey,
                                                                    );

                                                                return (
                                                                    <div
                                                                        key={
                                                                            tableKey
                                                                        }
                                                                    >
                                                                        <div className="flex items-center group">
                                                                            <button
                                                                                onClick={() =>
                                                                                    toggleTable(
                                                                                        tableKey,
                                                                                    )
                                                                                }
                                                                                className="p-1 flex-shrink-0 hover:opacity-80 transition-opacity"
                                                                                style={{ color: "var(--text-dim)" }}
                                                                            >
                                                                                <svg
                                                                                    width="6" height="6" viewBox="0 0 8 8" fill="currentColor"
                                                                                    style={{ transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                                                >
                                                                                    <polygon points="0,0 8,4 0,8" />
                                                                                </svg>
                                                                            </button>
                                                                            <button
                                                                                onClick={() =>
                                                                                    onTablePreview(
                                                                                        {
                                                                                            schema: schemaInfo.schema,
                                                                                            name: tableInfo.name,
                                                                                            database:
                                                                                                dbInfo.database,
                                                                                            primaryKeys:
                                                                                                tableInfo.primaryKeys,
                                                                                        },
                                                                                    )
                                                                                }
                                                                                className="flex-1 text-left px-2 py-1 text-[11px] transition-colors flex items-center gap-2 min-w-0"
                                                                                style={{ color: "var(--text-secondary)" }}
                                                                                onMouseEnter={(e) => {
                                                                                    e.currentTarget.style.background = "rgba(0,229,255,0.04)";
                                                                                    e.currentTarget.style.color = "var(--cyan)";
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    e.currentTarget.style.background = "transparent";
                                                                                    e.currentTarget.style.color = "var(--text-secondary)";
                                                                                }}
                                                                                title={`Preview ${dbInfo.database}.${tableInfo.name}`}
                                                                            >
                                                                                <span
                                                                                    className="flex-shrink-0 text-[11px]"
                                                                                    style={{
                                                                                        color: "var(--text-muted)",
                                                                                    }}
                                                                                >
                                                                                    <Icon type="table" />
                                                                                </span>
                                                                                <span className="truncate">
                                                                                    {
                                                                                        tableInfo.name
                                                                                    }
                                                                                </span>
                                                                                {Array.isArray(tableInfo.primaryKeys) &&
                                                                                    tableInfo.primaryKeys.length > 0 && (
                                                                                        <span
                                                                                            className="text-[9px] px-1 border rounded"
                                                                                            style={{
                                                                                                color: "var(--warning)",
                                                                                                borderColor:
                                                                                                    "var(--warning)",
                                                                                            }}
                                                                                            title={`Primary key: ${tableInfo.primaryKeys.join(", ")}`}
                                                                                        >
                                                                                            PK
                                                                                        </span>
                                                                                    )}
                                                                                <span
                                                                                    className="text-[10px] flex-shrink-0 ml-auto"
                                                                                    style={{
                                                                                        color: "var(--text-muted)",
                                                                                    }}
                                                                                >
                                                                                    {
                                                                                        tableInfo
                                                                                            .columns
                                                                                            .length
                                                                                    }
                                                                                </span>
                                                                            </button>
                                                                        </div>

                                                                        {/* Columns */}
                                                                        {isExpanded && (
                                                                            <div
                                                                                className="ml-6 space-y-px border-l pl-2"
                                                                                style={{
                                                                                    borderColor:
                                                                                        "var(--grid-line)",
                                                                                }}
                                                                            >
                                                                                {tableInfo.columns.map(
                                                                                    (
                                                                                        col,
                                                                                    ) => (
                                                                                        <div
                                                                                            key={
                                                                                                col.name
                                                                                            }
                                                                                            className="px-2 py-0.5 text-[11px] transition-colors flex items-center justify-between gap-2 rounded"
                                                                                            style={{
                                                                                                color: "var(--text-secondary)",
                                                                                            }}
                                                                                            onMouseEnter={(
                                                                                                e,
                                                                                            ) => {
                                                                                                e.currentTarget.style.background =
                                                                                                    "var(--panel)";
                                                                                            }}
                                                                                            onMouseLeave={(
                                                                                                e,
                                                                                            ) => {
                                                                                                e.currentTarget.style.background =
                                                                                                    "transparent";
                                                                                            }}
                                                                                            title={`${col.type}${col.nullable === "YES" ? " NULL" : " NOT NULL"}`}
                                                                                        >
                                                                                            <span className="truncate flex items-center gap-1">
                                                                                                <span
                                                                                                    className="text-[10px]"
                                                                                                    style={{
                                                                                                        color: "var(--text-muted)",
                                                                                                    }}
                                                                                                >
                                                                                                    <Icon type="column" />
                                                                                                </span>
                                                                                                <span>
                                                                                                    {
                                                                                                        col.name
                                                                                                    }
                                                                                                </span>
                                                                                                {tableInfo.primaryKeys?.includes(
                                                                                                    col.name,
                                                                                                ) && (
                                                                                                    <span
                                                                                                        className="text-[9px] px-1 border rounded"
                                                                                                        style={{
                                                                                                            color: "var(--warning)",
                                                                                                            borderColor:
                                                                                                                "var(--warning)",
                                                                                                        }}
                                                                                                    >
                                                                                                        PK
                                                                                                    </span>
                                                                                                )}
                                                                                            </span>
                                                                                            <span
                                                                                                className="text-[10px] flex-shrink-0"
                                                                                                style={{
                                                                                                    color: "var(--text-muted)",
                                                                                                }}
                                                                                            >
                                                                                                {
                                                                                                    col.type
                                                                                                }
                                                                                            </span>
                                                                                        </div>
                                                                                    ),
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        );
                    })}

                {/* Standard Mode - Show single database */}
                {!workspaceMode &&
                    !loading &&
                    Object.keys(filteredGroupedTables).length === 0 && (
                        <p
                            className="text-[11px] px-2 py-1 uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            No tables
                        </p>
                    )}

                {!workspaceMode &&
                    Object.entries(filteredGroupedTables).map(
                        ([schema, tables]) => (
                            <div key={schema} className="mb-1">
                                <button
                                    onClick={() => toggleStandardSchema(schema)}
                                    className="w-full text-[11px] px-2 py-1 flex items-center gap-1.5 transition-colors"
                                    style={{ color: "var(--text-muted)" }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                                >
                                    <svg
                                        width="6" height="6" viewBox="0 0 8 8" fill="currentColor"
                                        style={{ flexShrink: 0, transition: "transform 0.15s", transform: (expandedStandardSchemas.has(schema) || !!normalizedSearch) ? "rotate(90deg)" : "rotate(0deg)" }}
                                    >
                                        <polygon points="0,0 8,4 0,8" />
                                    </svg>
                                    <Icon type="schema" />
                                    {schema === "public" ? "tables" : schema}
                                    <span className="ml-auto" style={{ color: "var(--text-dim)" }}>
                                        {tables.length}
                                    </span>
                                </button>
                                {(expandedStandardSchemas.has(schema) ||
                                    normalizedSearch) && (
                                    <div
                                        className="space-y-px ml-3 border-l pl-2"
                                        style={{
                                            borderColor: "var(--grid-line)",
                                        }}
                                    >
                                        {tables.map((table) => {
                                            const tableKey = `${table.schema}.${table.name}`;
                                            const isExpanded =
                                                expandedTables.has(tableKey);
                                            const columns =
                                                tableColumns[tableKey] || [];

                                            return (
                                                <div key={tableKey}>
                                                    <div className="flex items-center group">
                                                        <button
                                                            onClick={() => toggleTable(tableKey)}
                                                            className="p-1 flex-shrink-0 transition-opacity hover:opacity-80"
                                                            style={{ color: "var(--text-dim)" }}
                                                        >
                                                            <svg
                                                                width="6" height="6" viewBox="0 0 8 8" fill="currentColor"
                                                                style={{ transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                            >
                                                                <polygon points="0,0 8,4 0,8" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                onTablePreview(
                                                                    table,
                                                                )
                                                            }
                                                            className="flex-1 text-left px-2 py-1 text-[11px] transition-colors flex items-center gap-2 min-w-0"
                                                            style={{ color: "var(--text-secondary)" }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = "rgba(0,229,255,0.04)";
                                                                e.currentTarget.style.color = "var(--cyan)";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = "transparent";
                                                                e.currentTarget.style.color = "var(--text-secondary)";
                                                            }}
                                                            title="Preview table data"
                                                        >
                                                            <span
                                                                className="flex-shrink-0 text-[11px]"
                                                                style={{
                                                                    color: "var(--text-muted)",
                                                                }}
                                                            >
                                                                <Icon type="table" />
                                                            </span>
                                                            <span className="truncate">
                                                                {table.name}
                                                            </span>
                                                            {Array.isArray(table.primaryKeys) &&
                                                                table.primaryKeys.length > 0 && (
                                                                    <span
                                                                        className="text-[9px] px-1 border rounded"
                                                                        style={{
                                                                            color: "var(--warning)",
                                                                            borderColor:
                                                                                "var(--warning)",
                                                                        }}
                                                                        title={`Primary key: ${table.primaryKeys.join(", ")}`}
                                                                    >
                                                                        PK
                                                                    </span>
                                                                )}
                                                            <span
                                                                className="text-[10px] flex-shrink-0 ml-auto"
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
                                                            {columns.map(
                                                                (col) => (
                                                                    <div
                                                                        key={
                                                                            col.name
                                                                        }
                                                                        className="px-2 py-0.5 text-[11px] transition-colors flex items-center justify-between gap-2 rounded"
                                                                        style={{
                                                                            color: "var(--text-secondary)",
                                                                        }}
                                                                        onMouseEnter={(
                                                                            e,
                                                                        ) => {
                                                                            e.currentTarget.style.background =
                                                                                "var(--panel)";
                                                                        }}
                                                                        onMouseLeave={(
                                                                            e,
                                                                        ) => {
                                                                            e.currentTarget.style.background =
                                                                                "transparent";
                                                                        }}
                                                                        title={`${col.type}${col.nullable === "YES" ? " NULL" : " NOT NULL"}`}
                                                                    >
                                                                        <span className="truncate flex items-center gap-1">
                                                                            <span
                                                                                className="text-[10px]"
                                                                                style={{
                                                                                    color: "var(--text-muted)",
                                                                                }}
                                                                            >
                                                                                <Icon type="column" />
                                                                            </span>
                                                                            <span>
                                                                                {
                                                                                    col.name
                                                                                }
                                                                            </span>
                                                                            {table.primaryKeys?.includes(
                                                                                col.name,
                                                                            ) && (
                                                                                <span
                                                                                    className="text-[9px] px-1 border rounded"
                                                                                    style={{
                                                                                        color: "var(--warning)",
                                                                                        borderColor:
                                                                                            "var(--warning)",
                                                                                    }}
                                                                                >
                                                                                    PK
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                        <span
                                                                            className="text-[10px] flex-shrink-0"
                                                                            style={{
                                                                                color: "var(--text-muted)",
                                                                            }}
                                                                        >
                                                                            {
                                                                                col.type
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ),
                    )}
            </div>
        </div>
    );
}
