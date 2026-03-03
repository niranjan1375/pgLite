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
}

interface WorkspaceSchema {
    database: string;
    schemas: {
        schema: string;
        tables: {
            name: string;
            columns: Column[];
        }[];
    }[];
}

interface DatabaseTreeProps {
    selectedDatabase: string;
    tableColumns: Record<string, Column[]>;
    onTablePreview: (table: Table) => void;
    onRefresh?: () => void;
    loading: boolean;
    workspaceMode?: boolean;
    workspaceSchemas?: WorkspaceSchema[];
}

export default function DatabaseTree({
    selectedDatabase,
    tableColumns,
    onTablePreview,
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
                grouped[schema].push({ schema, name });
            });
        }
        return grouped;
    }, [workspaceMode, tableColumns]);

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
            {/* Schema Browser Header */}
            <div
                className="px-3 py-2 border-b flex justify-between items-center"
                style={{
                    borderColor: "var(--border)",
                    background: "var(--panel)",
                }}
            >
                <div>
                    <h2
                        className="text-[11px] uppercase tracking-wider flex items-center gap-2"
                        style={{ color: "var(--text-muted)" }}
                    >
                        <span>
                            {workspaceMode ? "Schema Explorer" : "Schema"}
                        </span>
                        {workspaceMode && (
                            <span
                                className="px-1 py-[1px] text-[9px] border rounded"
                                style={{
                                    color: "var(--accent)",
                                    borderColor: "var(--accent)",
                                }}
                            >
                                WS
                            </span>
                        )}
                    </h2>
                    {!workspaceMode && selectedDatabase && (
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {selectedDatabase}
                            <span
                                className="ml-2"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {totalTables} TABLES
                            </span>
                        </p>
                    )}
                    {workspaceMode && (
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {workspaceSchemas.length} databases
                            <span
                                className="ml-2"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {totalTables} TABLES
                            </span>
                        </p>
                    )}
                </div>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="text-[14px] hover:opacity-80 transition-opacity disabled:opacity-30"
                        style={{ color: "var(--accent)" }}
                        title="Refresh schema"
                    >
                        ↻
                    </button>
                )}
            </div>

            <div
                className="px-2 py-2 border-b"
                style={{
                    borderColor: "var(--border)",
                    background: "var(--panel)",
                }}
            >
                <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search tables, columns..."
                    className="w-full text-[11px] px-2 py-1 rounded border outline-none"
                    style={{
                        background: "var(--bg)",
                        color: "var(--text-primary)",
                        borderColor: "var(--border)",
                    }}
                />
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
                            <div key={dbInfo.database} className="mb-2">
                                {/* Database Header */}
                                <button
                                    onClick={() =>
                                        toggleDatabase(dbInfo.database)
                                    }
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] tracking-wide font-medium hover:bg-[var(--panel)] transition-colors rounded"
                                    style={{ color: "var(--accent)" }}
                                >
                                    <span
                                        className={`text-[10px] transition-transform inline-block ${
                                            isDbExpanded ? "rotate-90" : ""
                                        }`}
                                    >
                                        <svg
                                            height={12}
                                            width={12}
                                            viewBox="-1.59 0 26.804 26.804"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="#000000"
                                        >
                                            <g
                                                id="SVGRepo_bgCarrier"
                                                stroke-width="0"
                                            ></g>
                                            <g
                                                id="SVGRepo_tracerCarrier"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            ></g>
                                            <g id="SVGRepo_iconCarrier">
                                                {" "}
                                                <g
                                                    id="Group_37"
                                                    data-name="Group 37"
                                                    transform="translate(-108.142 -942.014)"
                                                >
                                                    {" "}
                                                    <path
                                                        id="Path_17"
                                                        data-name="Path 17"
                                                        d="M109.642,968.818a1.5,1.5,0,0,1-1.5-1.5v-23.8a1.5,1.5,0,0,1,2.25-1.3l20.616,11.9a1.5,1.5,0,0,1,0,2.6l-20.616,11.9A1.5,1.5,0,0,1,109.642,968.818Zm1.5-22.707V964.72l16.116-9.3Z"
                                                        fill="#f3f3f3"
                                                    ></path>{" "}
                                                </g>{" "}
                                            </g>
                                        </svg>
                                    </span>
                                    <span
                                        className="text-[11px]"
                                        style={{ color: "var(--text-muted)" }}
                                    >
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
                                                    onClick={() =>
                                                        toggleSchema(schemaKey)
                                                    }
                                                    className="w-full flex items-center gap-2 px-2 py-1 text-[10px] tracking-wider hover:bg-[var(--panel)] transition-colors rounded"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    <span
                                                        className={`text-[8px] transition-transform inline-block ${
                                                            isSchemaExpanded
                                                                ? "rotate-90"
                                                                : ""
                                                        }`}
                                                    >
                                                        <svg
                                                            height={10}
                                                            width={10}
                                                            viewBox="-1.59 0 26.804 26.804"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="#000000"
                                                        >
                                                            <g
                                                                id="SVGRepo_bgCarrier"
                                                                stroke-width="0"
                                                            ></g>
                                                            <g
                                                                id="SVGRepo_tracerCarrier"
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                            ></g>
                                                            <g id="SVGRepo_iconCarrier">
                                                                {" "}
                                                                <g
                                                                    id="Group_37"
                                                                    data-name="Group 37"
                                                                    transform="translate(-108.142 -942.014)"
                                                                >
                                                                    {" "}
                                                                    <path
                                                                        id="Path_17"
                                                                        data-name="Path 17"
                                                                        d="M109.642,968.818a1.5,1.5,0,0,1-1.5-1.5v-23.8a1.5,1.5,0,0,1,2.25-1.3l20.616,11.9a1.5,1.5,0,0,1,0,2.6l-20.616,11.9A1.5,1.5,0,0,1,109.642,968.818Zm1.5-22.707V964.72l16.116-9.3Z"
                                                                        fill="#f3f3f3"
                                                                    ></path>{" "}
                                                                </g>{" "}
                                                            </g>
                                                        </svg>
                                                    </span>
                                                    <span className="text-[11px]">
                                                        <Icon type="schema" />
                                                    </span>
                                                    <span>
                                                        {schemaInfo.schema ===
                                                        "public"
                                                            ? "TABLES"
                                                            : schemaInfo.schema.toUpperCase()}
                                                    </span>
                                                    <span className="text-[9px] ml-auto">
                                                        (
                                                        {
                                                            schemaInfo.tables
                                                                .length
                                                        }
                                                        )
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
                                                                                >
                                                                                    ►
                                                                                </span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() =>
                                                                                    onTablePreview(
                                                                                        {
                                                                                            schema: schemaInfo.schema,
                                                                                            name: tableInfo.name,
                                                                                            database:
                                                                                                dbInfo.database,
                                                                                        },
                                                                                    )
                                                                                }
                                                                                className="flex-1 text-left px-2 py-1 text-[12px] transition-colors flex items-center gap-2 min-w-0 rounded"
                                                                                style={{
                                                                                    color: "var(--text-primary)",
                                                                                }}
                                                                                onMouseEnter={(
                                                                                    e,
                                                                                ) => {
                                                                                    e.currentTarget.style.background =
                                                                                        "var(--panel)";
                                                                                    e.currentTarget.style.color =
                                                                                        "var(--accent)";
                                                                                }}
                                                                                onMouseLeave={(
                                                                                    e,
                                                                                ) => {
                                                                                    e.currentTarget.style.background =
                                                                                        "transparent";
                                                                                    e.currentTarget.style.color =
                                                                                        "var(--text-primary)";
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
                            <div key={schema} className="mb-2">
                                <button
                                    onClick={() => toggleStandardSchema(schema)}
                                    className="w-full text-[10px] uppercase tracking-wider px-2 py-1 flex items-center gap-2 hover:bg-[var(--panel)] rounded"
                                    style={{ color: "var(--text-muted)" }}
                                >
                                    <span
                                        className={`text-[8px] transition-transform inline-block ${
                                            expandedStandardSchemas.has(
                                                schema,
                                            ) || normalizedSearch
                                                ? "rotate-90"
                                                : ""
                                        }`}
                                    ></span>
                                    <Icon type="schema" />
                                    {schema === "public"
                                        ? "TABLES"
                                        : schema.toUpperCase()}
                                    <span className="ml-auto text-[9px]">
                                        ({tables.length})
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
                                                            onClick={() =>
                                                                toggleTable(
                                                                    tableKey,
                                                                )
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
                                                                <svg
                                                                    viewBox="-1.59 0 26.804 26.804"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    fill="#000000"
                                                                >
                                                                    <g
                                                                        id="SVGRepo_bgCarrier"
                                                                        stroke-width="0"
                                                                    ></g>
                                                                    <g
                                                                        id="SVGRepo_tracerCarrier"
                                                                        stroke-linecap="round"
                                                                        stroke-linejoin="round"
                                                                    ></g>
                                                                    <g id="SVGRepo_iconCarrier">
                                                                        {" "}
                                                                        <g
                                                                            id="Group_37"
                                                                            data-name="Group 37"
                                                                            transform="translate(-108.142 -942.014)"
                                                                        >
                                                                            {" "}
                                                                            <path
                                                                                id="Path_17"
                                                                                data-name="Path 17"
                                                                                d="M109.642,968.818a1.5,1.5,0,0,1-1.5-1.5v-23.8a1.5,1.5,0,0,1,2.25-1.3l20.616,11.9a1.5,1.5,0,0,1,0,2.6l-20.616,11.9A1.5,1.5,0,0,1,109.642,968.818Zm1.5-22.707V964.72l16.116-9.3Z"
                                                                                fill="#f3f3f3"
                                                                            ></path>{" "}
                                                                        </g>{" "}
                                                                    </g>
                                                                </svg>
                                                            </span>
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                onTablePreview(
                                                                    table,
                                                                )
                                                            }
                                                            className="flex-1 text-left px-2 py-1 text-[12px] transition-colors flex items-center gap-2 min-w-0 rounded"
                                                            style={{
                                                                color: "var(--text-primary)",
                                                            }}
                                                            onMouseEnter={(
                                                                e,
                                                            ) => {
                                                                e.currentTarget.style.background =
                                                                    "var(--panel)";
                                                                e.currentTarget.style.color =
                                                                    "var(--accent)";
                                                            }}
                                                            onMouseLeave={(
                                                                e,
                                                            ) => {
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
                                                                <Icon type="table" />
                                                            </span>
                                                            <span className="truncate">
                                                                {table.name}
                                                            </span>
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
