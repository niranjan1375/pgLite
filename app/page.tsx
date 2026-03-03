"use client";

import {
    useState,
    useCallback,
    useEffect,
    useRef,
    useMemo,
    startTransition,
} from "react";
import dynamic from "next/dynamic";
import DatabaseTree from "@/components/DatabaseTree";
import ResultsTable from "@/components/ResultsTable";
import ActivityBar from "@/components/ActivityBar";
import StatusBar from "@/components/StatusBar";
import EnvironmentStrip from "@/components/EnvironmentStrip";
import KeyboardHelp from "@/components/KeyboardHelp";
import ConfirmDialog from "@/components/ConfirmDialog";
import { type QueryTab, type QueryTabsRef } from "@/components/QueryTabs";
import { getAllEnvironments } from "@/lib/environments";
import {
    extractVariables,
    selectionOverlapsVariableBlock,
    validateVariableValues,
    validateVariableReferences,
} from "@/lib/workspace-utils";

const SQLEditor = dynamic(() => import("@/components/SQLEditor"), {
    ssr: false,
});

const QueryTabs = dynamic(() => import("@/components/QueryTabs"), {
    ssr: false,
});

interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: string[];
    truncated?: boolean;
    routedDatabase?: string; // Present when workspace mode auto-routes to a database
}

interface QueryError {
    error: string;
    truncated?: boolean;
    rowCount?: number;
}

interface Table {
    schema: string;
    name: string;
    database?: string;
}

interface Column {
    name: string;
    type: string;
    nullable: string;
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

const WORKSPACE_SCHEMA_CACHE_TTL_MS = 120_000;

export default function Home() {
    const [result, setResult] = useState<QueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [executionTime, setExecutionTime] = useState<number | undefined>();
    const [activeTab, setActiveTab] = useState<QueryTab | null>(null);
    const [showProdWarning, setShowProdWarning] = useState(false);
    const [pendingQuery, setPendingQuery] = useState<{
        query: string;
        environment: string;
        database: string;
        readOnly: boolean;
        mode?: "standard" | "workspace";
    } | null>(null);
    const queryTabsRef = useRef<QueryTabsRef>(null);

    const [databasesByEnv, setDatabasesByEnv] = useState<
        Record<string, string[]>
    >({});
    const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>(
        {},
    );
    const [loadingTables, setLoadingTables] = useState(false);
    const [workspaceSchemas, setWorkspaceSchemas] = useState<WorkspaceSchema[]>(
        [],
    );
    const [editorHeight, setEditorHeight] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("editorHeight");
            return saved ? parseInt(saved, 10) : 280;
        }
        return 280;
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("sidebarCollapsed") === "true";
        }
        return false;
    });
    const [currentTable, setCurrentTable] = useState<{
        name: string;
        schema: string;
        database: string;
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        row: Record<string, unknown>;
        query: string;
    } | null>(null);
    const [templates, setTemplates] = useState<string[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    // Use refs to track in-flight requests and cache
    const databasesCacheRef = useRef<Record<string, string[]>>({});
    const isResizingRef = useRef(false);
    const resizeStartYRef = useRef(0);
    const resizeStartHeightRef = useRef(0);
    const inFlightRequestsRef = useRef<Record<string, Promise<string[]>>>({});
    const workspaceSchemasCacheRef = useRef<
        Partial<Record<string, { data: WorkspaceSchema[]; fetchedAt: number }>>
    >({});
    const workspaceSchemasInFlightRef = useRef<
        Partial<Record<string, Promise<WorkspaceSchema[]>>>
    >({});

    // Convert workspaceSchemas to tableColumns format for autocomplete
    const editorTableColumns = useMemo(() => {
        if (activeTab?.mode === "workspace" && workspaceSchemas.length > 0) {
            const columns: Record<string, Column[]> = {};
            workspaceSchemas.forEach((dbSchema) => {
                dbSchema.schemas.forEach((schema) => {
                    schema.tables.forEach((table) => {
                        const key = `${dbSchema.database}.${schema.schema}.${table.name}`;
                        columns[key] = table.columns;
                    });
                });
            });
            return columns;
        }
        return tableColumns;
    }, [activeTab?.mode, workspaceSchemas, tableColumns]);

    // Handle resize divider
    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isResizingRef.current = true;
            resizeStartYRef.current = e.clientY;
            resizeStartHeightRef.current = editorHeight;
            document.body.style.cursor = "row-resize";
            document.body.style.userSelect = "none";
        },
        [editorHeight],
    );

    useEffect(() => {
        const handleResizeMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            const delta = e.clientY - resizeStartYRef.current;

            // Calculate available space (viewport - fixed UI elements)
            const viewportHeight = window.innerHeight;
            const minResultsHeight = 200; // Minimum space for results table
            const fixedUIHeight = 150; // Tabs, status bar, etc.
            const maxEditorHeight =
                viewportHeight - minResultsHeight - fixedUIHeight;

            const newHeight = Math.min(
                Math.max(
                    resizeStartHeightRef.current + delta,
                    150, // Min 150px for editor
                ),
                maxEditorHeight, // Don't exceed viewport
            );
            setEditorHeight(newHeight);
        };

        const handleResizeEnd = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                localStorage.setItem("editorHeight", editorHeight.toString());
            }
        };

        document.addEventListener("mousemove", handleResizeMove);
        document.addEventListener("mouseup", handleResizeEnd);

        return () => {
            document.removeEventListener("mousemove", handleResizeMove);
            document.removeEventListener("mouseup", handleResizeEnd);
        };
    }, [editorHeight]);

    useEffect(() => {
        localStorage.setItem("sidebarCollapsed", sidebarCollapsed.toString());
    }, [sidebarCollapsed]);

    useEffect(() => {
        const handleToggleSidebarShortcut = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                setSidebarCollapsed((prev) => !prev);
            }
        };

        document.addEventListener("keydown", handleToggleSidebarShortcut);
        return () => {
            document.removeEventListener(
                "keydown",
                handleToggleSidebarShortcut,
            );
        };
    }, []);

    // Fetch tables and columns for the active tab
    const fetchTablesAndColumns = useCallback(
        async (forceRefresh = false) => {
            if (!activeTab) return;

            // Workspace mode: fetch all database schemas
            if (activeTab.mode === "workspace") {
                const environment = activeTab.environment;
                const cached = workspaceSchemasCacheRef.current[environment];
                const isFresh =
                    cached &&
                    Date.now() - cached.fetchedAt <
                        WORKSPACE_SCHEMA_CACHE_TTL_MS;

                if (!forceRefresh && isFresh) {
                    setWorkspaceSchemas(cached.data);
                    return;
                }

                if (
                    !forceRefresh &&
                    workspaceSchemasInFlightRef.current[environment]
                ) {
                    setLoadingTables(true);
                    try {
                        const schemas =
                            await workspaceSchemasInFlightRef.current[
                                environment
                            ];
                        setWorkspaceSchemas(schemas);
                    } catch (err) {
                        console.error(
                            "Failed to fetch workspace schemas:",
                            err,
                        );
                    } finally {
                        setLoadingTables(false);
                    }
                    return;
                }

                setLoadingTables(true);
                try {
                    const requestPromise = (async () => {
                        const res = await fetch(
                            `/api/workspace-schemas?environment=${environment}${forceRefresh ? "&refresh=1" : ""}`,
                        );
                        const data = await res.json();
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        const schemas = (data.schemas ||
                            []) as WorkspaceSchema[];
                        workspaceSchemasCacheRef.current[environment] = {
                            data: schemas,
                            fetchedAt: Date.now(),
                        };
                        return schemas;
                    })();

                    workspaceSchemasInFlightRef.current[environment] =
                        requestPromise;
                    const schemas = await requestPromise;
                    setWorkspaceSchemas(schemas);
                } catch (err) {
                    console.error("Failed to fetch workspace schemas:", err);
                } finally {
                    delete workspaceSchemasInFlightRef.current[environment];
                    setLoadingTables(false);
                }
                return;
            }

            // Standard mode: fetch single database schema
            if (!activeTab.database) return;

            setLoadingTables(true);
            try {
                const columnsRes = await fetch("/api/columns", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        database: activeTab.database,
                        environment: activeTab.environment,
                    }),
                });

                const columnsData = await columnsRes.json();

                if (!columnsData.error) {
                    setTableColumns(columnsData.tableColumns);
                }
            } catch (err) {
                console.error("Failed to fetch tables/columns:", err);
            } finally {
                setLoadingTables(false);
            }
        },
        [activeTab],
    );

    const fetchTemplates = useCallback(async () => {
        setLoadingTemplates(true);
        try {
            const res = await fetch("/api/templates", {
                cache: "no-store",
            });
            const data = await res.json();
            if (!data.error && Array.isArray(data.templates)) {
                setTemplates(data.templates);
            }
        } catch (err) {
            console.error("Failed to fetch templates:", err);
        } finally {
            setLoadingTemplates(false);
        }
    }, []);

    const handleTemplateOpen = useCallback(async (name: string) => {
        try {
            const res = await fetch(
                `/api/templates/${encodeURIComponent(name)}`,
                {
                    cache: "no-store",
                },
            );
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || "Failed to open template.");
                return;
            }

            const env =
                queryTabsRef.current?.getActiveTab()?.environment || "loadtest";
            queryTabsRef.current?.openWorkspaceTab({
                name,
                content: data.content,
                environment: env,
            });
        } catch (err) {
            console.error("Failed to open template:", err);
            setError("Failed to open template.");
        }
    }, []);

    const handleSaveTemplate = useCallback(async () => {
        const currentTab = queryTabsRef.current?.getActiveTab();
        if (!currentTab || currentTab.mode !== "workspace") return;

        let templateName = currentTab.templateName;
        if (!templateName) {
            const inputName = window.prompt("Template name (.sql optional):");
            if (!inputName) return;
            templateName = inputName;
        }

        try {
            const res = await fetch("/api/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: templateName,
                    content: currentTab.query,
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || "Failed to save template.");
                return;
            }

            if (data.name) {
                queryTabsRef.current?.setActiveTabTemplateName(data.name);
            }

            await fetchTemplates();
        } catch (err) {
            console.error("Failed to save template:", err);
            setError("Failed to save template.");
        }
    }, [fetchTemplates]);

    // Fetch tables and columns when active tab's database or environment changes
    useEffect(() => {
        fetchTablesAndColumns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab?.database, activeTab?.environment]);

    useEffect(() => {
        if (activeTab?.mode === "workspace") {
            fetchTemplates();
        }
    }, [activeTab?.mode, fetchTemplates]);

    // Helper to detect write queries
    const isWriteQuery = useCallback((query: string): boolean => {
        const upperQuery = query.trim().toUpperCase();
        const writeKeywords = [
            "INSERT",
            "UPDATE",
            "DELETE",
            "DROP",
            "CREATE",
            "ALTER",
            "TRUNCATE",
            "REPLACE",
            "MERGE",
        ];
        return writeKeywords.some((keyword) => upperQuery.startsWith(keyword));
    }, []);

    // Helper to check if environment is production
    const isProdEnvironment = useCallback((environment: string): boolean => {
        return (
            environment.includes("uat") ||
            environment.includes("prod") ||
            environment.includes("staging")
        );
    }, []);

    // Helper to extract table info from SELECT queries
    const extractTableFromQuery = useCallback(
        (
            query: string,
            database: string,
        ): { name: string; schema: string; database: string } | null => {
            const trimmedQuery = query.trim().toUpperCase();
            if (!trimmedQuery.startsWith("SELECT")) return null;

            // Match: FROM table_name, FROM schema.table_name, or FROM database.schema.table_name
            const fromMatch = query.match(
                /FROM\s+([a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i,
            );
            if (!fromMatch) return null;

            const parts = fromMatch[0].replace(/FROM\s+/i, "").split(".");

            if (parts.length === 1) {
                // FROM table_name -> use public schema
                return { name: parts[0], schema: "public", database };
            } else if (parts.length === 2) {
                // FROM schema.table_name
                return { name: parts[1], schema: parts[0], database };
            } else if (parts.length === 3) {
                // FROM database.schema.table_name
                return { name: parts[2], schema: parts[1], database: parts[0] };
            }

            return null;
        },
        [],
    );

    const executeQuery = useCallback(
        async (
            query: string,
            environment: string,
            database: string,
            readOnly: boolean,
            mode: "standard" | "workspace" = "standard",
            variables?: Record<string, string>,
        ) => {
            if (!query.trim()) return;

            setLoading(true);
            setResult(null);
            setError(null);
            setExecutionTime(undefined);

            const startTime = performance.now();

            try {
                // Use workspace-query endpoint for workspace mode
                const endpoint =
                    mode === "workspace"
                        ? "/api/workspace-query"
                        : "/api/query";

                // Workspace mode sends structured payload with sql and variables
                const requestBody =
                    mode === "workspace"
                        ? {
                              sql: query,
                              variables: variables || {},
                              environment,
                          }
                        : { query, database, environment, readOnly };

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                });
                const data: QueryResult | QueryError = await res.json();

                const endTime = performance.now();
                const execTime = Math.round(endTime - startTime);
                setExecutionTime(execTime);

                // Use startTransition for non-urgent UI updates (large datasets)
                startTransition(() => {
                    if ("error" in data) {
                        setError(data.error);
                    } else {
                        setResult(data);

                        // Extract table info from SELECT queries to enable delete functionality
                        const tableInfo = extractTableFromQuery(
                            query,
                            database,
                        );
                        if (tableInfo) {
                            setCurrentTable(tableInfo);
                        }
                    }
                    setLoading(false);
                });
            } catch {
                setError("Failed to connect to the server.");
                setLoading(false);
            }
        },
        [extractTableFromQuery],
    );

    const runQuery = useCallback(
        async (
            query: string,
            environment: string,
            database: string,
            readOnly: boolean,
            mode: "standard" | "workspace" = "standard",
            variables?: Record<string, string>,
        ) => {
            if (!query.trim()) return;

            // Workspace mode bypasses write checks and production warnings
            if (mode === "workspace") {
                await executeQuery(
                    query,
                    environment,
                    database,
                    readOnly,
                    "workspace",
                    variables,
                );
                return;
            }

            // Check if this is a write query in production
            if (
                !readOnly &&
                isWriteQuery(query) &&
                isProdEnvironment(environment)
            ) {
                setPendingQuery({
                    query,
                    environment,
                    database,
                    readOnly,
                    mode,
                });
                setShowProdWarning(true);
                return;
            }

            // Execute query immediately
            await executeQuery(
                query,
                environment,
                database,
                readOnly,
                "standard",
            );
        },
        [isWriteQuery, isProdEnvironment, executeQuery],
    );

    const handleTablePreview = useCallback(
        (table: Table) => {
            const currentTab = queryTabsRef.current?.getActiveTab();
            if (!currentTab) return;

            const fullTableName =
                table.schema === "public"
                    ? table.name
                    : `${table.schema}.${table.name}`;

            const targetDatabase = table.database || currentTab.database;
            const mode = table.database ? "workspace" : "standard";
            if (!targetDatabase) return;

            // Track current table for delete functionality
            setCurrentTable({
                name: table.name,
                schema: table.schema,
                database: targetDatabase,
            });

            // Enable write mode for table preview (to allow delete)
            if (currentTab.readOnly) {
                queryTabsRef.current?.toggleTabReadOnly?.(currentTab.id);
            }

            runQuery(
                `SELECT * FROM ${fullTableName} LIMIT 100;`,
                currentTab.environment,
                targetDatabase,
                false, // table preview is always in write mode
                mode,
            );
        },
        [runQuery],
    );

    // Handle delete row
    const handleDeleteRow = useCallback(
        async (row: Record<string, unknown>) => {
            console.log("Delete clicked, currentTable:", currentTable);
            console.log("Row data:", row);
            if (!currentTable) {
                console.error("No currentTable set!");
                return;
            }

            // Build WHERE clause using all columns to uniquely identify the row
            const whereClauses = Object.entries(row)
                .map(([key, value]) => {
                    if (value === null) {
                        return `${key} IS NULL`;
                    }
                    if (typeof value === "string") {
                        return `${key} = '${value.replace(/'/g, "''")}'`; // Escape single quotes
                    }
                    return `${key} = ${value}`;
                })
                .join(" AND ");

            const fullTableName =
                currentTable.schema === "public"
                    ? currentTable.name
                    : `${currentTable.schema}.${currentTable.name}`;

            const deleteQuery = `DELETE FROM ${fullTableName} WHERE ${whereClauses};`;

            console.log("Delete query:", deleteQuery);

            // Show confirmation dialog
            setDeleteConfirm({ row, query: deleteQuery });
        },
        [currentTable],
    );

    // Execute delete after confirmation
    const executeDelete = useCallback(async () => {
        if (!deleteConfirm || !currentTable) return;

        const currentTab = queryTabsRef.current?.getActiveTab();
        if (!currentTab) return;

        // Execute delete query
        await runQuery(
            deleteConfirm.query,
            currentTab.environment,
            currentTable.database,
            false,
            currentTable.database !== currentTab.database
                ? "workspace"
                : "standard",
        );

        // Refresh table data after delete
        const fullTableName =
            currentTable.schema === "public"
                ? currentTable.name
                : `${currentTable.schema}.${currentTable.name}`;

        runQuery(
            `SELECT * FROM ${fullTableName} LIMIT 100;`,
            currentTab.environment,
            currentTable.database,
            false,
            currentTable.database !== currentTab.database
                ? "workspace"
                : "standard",
        );

        setDeleteConfirm(null);
    }, [deleteConfirm, currentTable, runQuery]);

    // Fetch databases for a specific environment
    const fetchDatabasesForEnvironment = useCallback(
        async (environment: string) => {
            // Check ref-based cache first
            if (databasesCacheRef.current[environment]) {
                return databasesCacheRef.current[environment];
            }

            // Check if there's already a request in flight for this environment
            if (environment in inFlightRequestsRef.current) {
                return inFlightRequestsRef.current[environment];
            }

            // Create new request
            const requestPromise = (async () => {
                try {
                    const res = await fetch(
                        `/api/databases?environment=${environment}`,
                    );
                    const data = await res.json();
                    if (!data.error) {
                        // Update both ref cache and state
                        databasesCacheRef.current[environment] = data.databases;
                        setDatabasesByEnv((prev) => ({
                            ...prev,
                            [environment]: data.databases,
                        }));
                        return data.databases;
                    }
                } catch (err) {
                    console.error(
                        `Failed to fetch databases for ${environment}:`,
                        err,
                    );
                } finally {
                    // Clear in-flight request
                    delete inFlightRequestsRef.current[environment];
                }
                return [];
            })();

            // Store the in-flight request
            inFlightRequestsRef.current[environment] = requestPromise;
            return requestPromise;
        },
        [],
    );

    // When active tab changes, fetch databases for its environment
    const handleTabChange = useCallback(
        async (tab: QueryTab) => {
            setActiveTab((prevTab) => {
                // Only update if something meaningful changed
                if (
                    prevTab?.id === tab.id &&
                    prevTab?.environment === tab.environment &&
                    prevTab?.database === tab.database &&
                    prevTab?.readOnly === tab.readOnly
                ) {
                    return prevTab; // Return same reference to prevent re-render
                }
                return tab;
            });
            // Clear previous query results when switching tabs/environments/databases
            setResult(null);
            setError(null);
            setExecutionTime(undefined);
            setLoading(false);

            // Fetch databases for this tab's environment if not already cached
            await fetchDatabasesForEnvironment(tab.environment);
        },
        [fetchDatabasesForEnvironment],
    );

    return (
        <div
            className="flex h-screen"
            style={{
                background: "var(--bg)",
                color: "var(--text-primary)",
            }}
        >
            {/* Activity Bar - 40px left strip */}
            <ActivityBar
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
            />

            {/* Main Layout */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Query Tabs */}
                <div
                    className="border-b flex-shrink-0 flex items-stretch"
                    style={{ borderColor: "var(--border)" }}
                >
                    <div className="flex-1 min-w-0">
                        <QueryTabs
                            ref={queryTabsRef}
                            globalDatabase={activeTab?.database || ""}
                            globalEnvironment={
                                activeTab?.environment || "loadtest"
                            }
                            databases={
                                activeTab
                                    ? databasesByEnv[activeTab.environment] ||
                                      []
                                    : []
                            }
                            onTabChange={handleTabChange}
                        />
                    </div>
                </div>

                {/* Content: Explorer | Editor + Results */}
                <div className="flex flex-1 min-h-0">
                    {!sidebarCollapsed && (
                        <aside
                            className="w-[240px] flex-shrink-0 border-r flex flex-col"
                            style={{
                                background: "var(--panel)",
                                borderColor: "var(--border)",
                            }}
                        >
                            <DatabaseTree
                                selectedDatabase={activeTab?.database || ""}
                                tableColumns={tableColumns}
                                onTablePreview={handleTablePreview}
                                templates={templates}
                                templatesLoading={loadingTemplates}
                                onTemplateOpen={handleTemplateOpen}
                                onRefresh={() => fetchTablesAndColumns(true)}
                                loading={loadingTables}
                                workspaceMode={activeTab?.mode === "workspace"}
                                workspaceSchemas={workspaceSchemas}
                            />
                        </aside>
                    )}

                    {/* Editor + Results */}
                    <main className="flex-1 flex flex-col min-w-0">
                        {/* Environment Strip */}
                        {activeTab && (
                            <EnvironmentStrip
                                environment={activeTab.environment}
                                database={activeTab.database}
                                readOnly={activeTab.readOnly}
                                availableEnvironments={getAllEnvironments()}
                                availableDatabases={
                                    databasesByEnv[activeTab.environment] || []
                                }
                                onEnvironmentChange={(env) => {
                                    queryTabsRef.current?.updateTabEnvironment?.(
                                        activeTab.id,
                                        env,
                                    );
                                }}
                                onDatabaseChange={(db) => {
                                    queryTabsRef.current?.updateTabDatabase?.(
                                        activeTab.id,
                                        db,
                                    );
                                }}
                                onReadOnlyToggle={() => {
                                    queryTabsRef.current?.toggleTabReadOnly?.(
                                        activeTab.id,
                                    );
                                }}
                            />
                        )}

                        {/* SQL Editor - Resizable */}
                        <div
                            className="flex-shrink-0 flex flex-col"
                            style={{ height: `${editorHeight}px` }}
                        >
                            <div className="flex-1 min-h-0 overflow-hidden">
                                {activeTab && (
                                    <SQLEditor
                                        value={activeTab.query}
                                        onChange={(val) => {
                                            queryTabsRef.current?.updateQuery(
                                                val || "",
                                            );
                                        }}
                                        isExecuting={loading}
                                        onRunQuery={(
                                            queryToRun,
                                            executionContext,
                                        ) => {
                                            const currentTab =
                                                queryTabsRef.current?.getActiveTab();
                                            if (currentTab) {
                                                // Workspace mode: extract variables and send structured payload
                                                if (
                                                    currentTab.mode ===
                                                    "workspace"
                                                ) {
                                                    try {
                                                        // Extract variables from full editor content
                                                        const {
                                                            variables,
                                                            variableBlockEndLine,
                                                        } = extractVariables(
                                                            currentTab.query,
                                                        );

                                                        if (
                                                            executionContext?.isSelection &&
                                                            typeof executionContext.selectionStartLineNumber ===
                                                                "number" &&
                                                            selectionOverlapsVariableBlock(
                                                                executionContext.selectionStartLineNumber -
                                                                    1,
                                                                variableBlockEndLine,
                                                            )
                                                        ) {
                                                            throw new Error(
                                                                "Selection overlaps variable block. Select SQL below variable definitions.",
                                                            );
                                                        }

                                                        const sqlToExecute =
                                                            queryToRun.trim();

                                                        if (!sqlToExecute) {
                                                            throw new Error(
                                                                "No SQL to execute.",
                                                            );
                                                        }

                                                        // Validate variable values if any exist
                                                        if (
                                                            Object.keys(
                                                                variables,
                                                            ).length > 0
                                                        ) {
                                                            validateVariableValues(
                                                                variables,
                                                            );
                                                            validateVariableReferences(
                                                                sqlToExecute,
                                                                variables,
                                                            );
                                                        }

                                                        // Execute with structured payload
                                                        runQuery(
                                                            sqlToExecute,
                                                            currentTab.environment,
                                                            currentTab.database,
                                                            currentTab.readOnly,
                                                            "workspace",
                                                            variables,
                                                        );
                                                    } catch (error) {
                                                        // Show validation error
                                                        setError(
                                                            error instanceof
                                                                Error
                                                                ? error.message
                                                                : "Variable validation failed",
                                                        );
                                                    }
                                                } else {
                                                    // Standard mode: use selected or statement at cursor
                                                    runQuery(
                                                        queryToRun,
                                                        currentTab.environment,
                                                        currentTab.database,
                                                        currentTab.readOnly,
                                                        currentTab.mode ||
                                                            "standard",
                                                    );
                                                }
                                            }
                                        }}
                                        tableColumns={editorTableColumns}
                                        databases={
                                            databasesByEnv[
                                                activeTab.environment
                                            ] || []
                                        }
                                    />
                                )}
                            </div>

                            {/* Run Button Strip */}
                            <div
                                className="h-[32px] flex items-center justify-between px-3 text-[12px] border-t"
                                style={{
                                    background: "var(--panel)",
                                    borderColor: "var(--border)",
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const currentTab =
                                                queryTabsRef.current?.getActiveTab();
                                            if (currentTab) {
                                                // Workspace mode: extract variables
                                                if (
                                                    currentTab.mode ===
                                                    "workspace"
                                                ) {
                                                    try {
                                                        const {
                                                            variables,
                                                            sqlWithoutVars,
                                                        } = extractVariables(
                                                            currentTab.query,
                                                        );

                                                        if (
                                                            Object.keys(
                                                                variables,
                                                            ).length > 0
                                                        ) {
                                                            validateVariableValues(
                                                                variables,
                                                            );
                                                            validateVariableReferences(
                                                                sqlWithoutVars,
                                                                variables,
                                                            );
                                                        }

                                                        runQuery(
                                                            sqlWithoutVars,
                                                            currentTab.environment,
                                                            currentTab.database,
                                                            currentTab.readOnly,
                                                            "workspace",
                                                            variables,
                                                        );
                                                    } catch (error) {
                                                        setError(
                                                            error instanceof
                                                                Error
                                                                ? error.message
                                                                : "Variable validation failed",
                                                        );
                                                    }
                                                } else {
                                                    // Standard mode: run full query
                                                    runQuery(
                                                        currentTab.query,
                                                        currentTab.environment,
                                                        currentTab.database,
                                                        currentTab.readOnly,
                                                        currentTab.mode ||
                                                            "standard",
                                                    );
                                                }
                                            }
                                        }}
                                        disabled={
                                            loading || !activeTab?.query.trim()
                                        }
                                        className="hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                        style={{
                                            color: loading
                                                ? "var(--text-muted)"
                                                : "var(--accent)",
                                        }}
                                    >
                                        {loading ? (
                                            <span className="flex items-center gap-2">
                                                <span className="inline-block w-2 h-2 border border-current border-t-transparent animate-spin" />
                                                Executing
                                                {executionTime !== undefined
                                                    ? `... ${(executionTime / 1000).toFixed(2)}s`
                                                    : "..."}
                                            </span>
                                        ) : (
                                            "[ Run ⌘↵ ]"
                                        )}
                                    </button>
                                    {activeTab?.mode === "workspace" && (
                                        <button
                                            onClick={handleSaveTemplate}
                                            className="px-2 py-0.5 hover:opacity-80 transition-opacity border rounded text-[10px]"
                                            style={{
                                                color: "var(--accent)",
                                                borderColor: "var(--accent)",
                                            }}
                                            title="Save or overwrite template"
                                        >
                                            SAVE TEMPLATE
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => fetchTablesAndColumns(true)}
                                    disabled={loadingTables}
                                    className="px-2 py-0.5 hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed border rounded text-[10px]"
                                    style={{
                                        color: "var(--text-muted)",
                                        borderColor: "var(--border)",
                                    }}
                                    title="Refresh autocomplete/intellisense data"
                                >
                                    {loadingTables ? (
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block w-2 h-2 border border-current border-t-transparent animate-spin rounded-full" />
                                            REFRESHING
                                        </span>
                                    ) : (
                                        "⟳ INTELLISENSE"
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Resize Handle */}
                        <div
                            className="h-[4px] flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors border-b"
                            style={{
                                borderColor: "var(--border)",
                                background: "var(--border)",
                            }}
                            onMouseDown={handleResizeStart}
                            title="Drag to resize editor"
                        />

                        {/* Results */}
                        <div className="flex-1 flex flex-col min-h-0">
                            {result?.routedDatabase && (
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
                                    <span style={{ fontWeight: 600 }}>
                                        {result.routedDatabase}
                                    </span>
                                </div>
                            )}
                            {result?.truncated && (
                                <div
                                    className="px-3 py-1.5 text-[11px] uppercase tracking-wide border-b flex items-center gap-2"
                                    style={{
                                        background: "#1a1100",
                                        borderColor: "var(--warning)",
                                        color: "var(--warning)",
                                    }}
                                >
                                    ⚠ RESULTS TRUNCATED AT{" "}
                                    {result.rowCount.toLocaleString()} ROWS
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                                <ResultsTable
                                    result={result}
                                    error={error}
                                    loading={loading}
                                    readOnly={activeTab?.readOnly ?? true}
                                    tableName={
                                        currentTable
                                            ? currentTable.schema === "public"
                                                ? currentTable.name
                                                : `${currentTable.schema}.${currentTable.name}`
                                            : undefined
                                    }
                                    onDeleteRow={handleDeleteRow}
                                />
                            </div>
                        </div>
                    </main>
                </div>

                {/* Status Bar */}
                <StatusBar
                    environment={activeTab?.environment || ""}
                    database={activeTab?.database || ""}
                    readOnly={activeTab?.readOnly || false}
                    rowCount={result?.rowCount}
                    executionTime={executionTime}
                    connected={true}
                />
            </div>

            {/* Keyboard Help */}
            <KeyboardHelp />

            {/* Production Write Warning */}
            {showProdWarning && pendingQuery && (
                <ConfirmDialog
                    title="Production Write Warning"
                    message={`You are about to execute a write query in ${pendingQuery.environment.toUpperCase()} environment on database "${pendingQuery.database}". This operation cannot be undone. Are you sure you want to proceed?`}
                    confirmLabel="Execute"
                    cancelLabel="Cancel"
                    isDangerous={true}
                    onConfirm={() => {
                        if (pendingQuery) {
                            executeQuery(
                                pendingQuery.query,
                                pendingQuery.environment,
                                pendingQuery.database,
                                pendingQuery.readOnly,
                                pendingQuery.mode || "standard",
                            );
                        }
                        setShowProdWarning(false);
                        setPendingQuery(null);
                    }}
                    onCancel={() => {
                        setShowProdWarning(false);
                        setPendingQuery(null);
                    }}
                />
            )}

            {/* Delete Row Confirmation */}
            {deleteConfirm && (
                <ConfirmDialog
                    title="Delete Row"
                    message={`Are you sure you want to delete this row? This operation cannot be undone.\n\n${deleteConfirm.query}`}
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    isDangerous={true}
                    onConfirm={executeDelete}
                    onCancel={() => setDeleteConfirm(null)}
                />
            )}
        </div>
    );
}
