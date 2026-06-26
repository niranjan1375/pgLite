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
import ExplainView from "@/components/ExplainView";
import ResultsTable from "@/components/ResultsTable";
import ActivityBar from "@/components/ActivityBar";
import StatusBar from "@/components/StatusBar";
import EnvironmentStrip from "@/components/EnvironmentStrip";
import KeyboardHelp from "@/components/KeyboardHelp";
import ConfirmDialog from "@/components/ConfirmDialog";
import QueryHistory, { type QueryHistoryItem } from "@/components/QueryHistory";
import SaveQueryModal from "@/components/SaveQueryModal";
import SavedQueries from "@/components/SavedQueries";
import { type QueryTab, type QueryTabsRef } from "@/components/QueryTabs";
import {
    createSavedQuery,
    readSavedQueries,
    toggleSavedQueryStar,
    writeSavedQueries,
    type SavedQuery,
    type SavedQueryInput,
} from "@/lib/queryStorage";
import {
    extractVariables,
    selectionOverlapsVariableBlock,
    validateVariableValues,
    validateVariableReferences,
} from "@/lib/workspace-utils";
import { RefreshIcon } from "@/icons";

const SQLEditor = dynamic(() => import("@/components/SQLEditor"), {
    ssr: false,
});

const QueryTabs = dynamic(() => import("@/components/QueryTabs"), {
    ssr: false,
});

const WORKSPACE_QUERY_TIMEOUT_MS = 120000;

interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    totalRows?: number; // Full row count before truncation (present when truncated)
    fields: string[];
    truncated?: boolean;
    routedDatabase?: string; // Present when workspace mode auto-routes to a database
}

interface QueryError {
    error: string;
    truncated?: boolean;
    rowCount?: number;
}

interface ExplainNode {
    "Node Type": string;
    Plans?: ExplainNode[];
}

interface ExplainResult {
    isExplain: true;
    explain: {
        Plan: ExplainNode;
        "Planning Time"?: number;
        "Execution Time"?: number;
    };
    executionTime?: number;
    routedDatabase?: string;
}

function isQueryError(
    data: QueryResult | QueryError | ExplainResult,
): data is QueryError {
    return "error" in data;
}

function isExplainResult(
    data: QueryResult | QueryError | ExplainResult,
): data is ExplainResult {
    return "isExplain" in data && data.isExplain;
}

interface Table {
    schema: string;
    name: string;
    database?: string;
    primaryKeys?: string[];
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
            primaryKeys?: string[];
            columns: Column[];
        }[];
    }[];
}

interface StandardSchemaPayload {
    tableColumns: Record<string, Column[]>;
    primaryKeysByTable: Record<string, string[]>;
}

interface TableViewerState {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    sortColumn: string | null;
    sortDirection: "asc" | "desc";
    searchQuery: string;
}

interface EnvironmentSummary {
    id: string;
    name: string;
    requiresVPN: boolean;
}

const WORKSPACE_SCHEMA_CACHE_TTL_MS = 120_000;
const TABLE_COLUMNS_CACHE_TTL_MS = 5 * 60_000; // 5 minutes, matches server-side cache
const QUERY_HISTORY_STORAGE_KEY = "pgLite_queryHistory";
const MAX_QUERY_HISTORY_ITEMS = 100;
const DEFAULT_TABLE_VIEW_PAGE_SIZE = 100;

export default function Home() {
    const [result, setResult] = useState<QueryResult | null>(null);
    const [explainResult, setExplainResult] = useState<ExplainResult | null>(
        null,
    );
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
    const [primaryKeysByTable, setPrimaryKeysByTable] = useState<
        Record<string, string[]>
    >({});
    const [loadingTables, setLoadingTables] = useState(false);
    const [workspaceSchemas, setWorkspaceSchemas] = useState<WorkspaceSchema[]>(
        [],
    );
    const [editorHeight, setEditorHeight] = useState<number>(280);
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
    const [currentTable, setCurrentTable] = useState<{
        name: string;
        schema: string;
        database: string;
        primaryKeys?: string[];
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        row: Record<string, unknown>;
        query: string;
    } | null>(null);
    const [templates, setTemplates] = useState<string[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [availableEnvironmentIds, setAvailableEnvironmentIds] = useState<
        string[]
    >([]);
    const [environmentNamesById, setEnvironmentNamesById] = useState<
        Record<string, string>
    >({});
    const [defaultEnvironment, setDefaultEnvironment] = useState<string>("dev");
    const [connected, setConnected] = useState(false);
    const [dbLatency, setDbLatency] = useState<number | undefined>();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [savedQueriesOpen, setSavedQueriesOpen] = useState(false);
    const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
    const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
    const [tableViewerState, setTableViewerState] =
        useState<TableViewerState | null>(null);
    const [saveQueryModalOpen, setSaveQueryModalOpen] = useState(false);
    const [saveQueryModalSeed, setSaveQueryModalSeed] = useState(0);

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
    const tableColumnsCacheRef = useRef<
        Partial<
            Record<string, { data: StandardSchemaPayload; fetchedAt: number }>
        >
    >({});
    const tableColumnsInFlightRef = useRef<
        Partial<Record<string, Promise<StandardSchemaPayload>>>
    >({});

    useEffect(() => {
        const fetchEnvironments = async () => {
            try {
                const res = await fetch("/api/environments", {
                    cache: "no-store",
                });
                const data = await res.json();

                const envs: EnvironmentSummary[] = Array.isArray(
                    data.environments,
                )
                    ? data.environments
                    : [];

                if (envs.length === 0) return;

                setAvailableEnvironmentIds(envs.map((env) => env.id));
                setEnvironmentNamesById(
                    envs.reduce<Record<string, string>>((acc, env) => {
                        acc[env.id] = env.name;
                        return acc;
                    }, {}),
                );
                if (typeof data.defaultEnvironment === "string") {
                    setDefaultEnvironment(data.defaultEnvironment);
                }
            } catch (err) {
                console.error("Failed to fetch environments:", err);
            }
        };

        fetchEnvironments();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            const stored = localStorage.getItem(QUERY_HISTORY_STORAGE_KEY);
            if (!stored) {
                return;
            }

            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                setQueryHistory(parsed);
            }
        } catch (err) {
            console.error("Failed to load query history:", err);
        }
    }, []);

    useEffect(() => {
        setSavedQueries(readSavedQueries());
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            localStorage.setItem(
                QUERY_HISTORY_STORAGE_KEY,
                JSON.stringify(queryHistory),
            );
        } catch (err) {
            console.error("Failed to save query history:", err);
        }
    }, [queryHistory]);

    useEffect(() => {
        writeSavedQueries(savedQueries);
    }, [savedQueries]);

    const appendQueryHistory = useCallback((item: QueryHistoryItem) => {
        setQueryHistory((prevHistory) =>
            [item, ...prevHistory].slice(0, MAX_QUERY_HISTORY_ITEMS),
        );
    }, []);

    const removeQueryHistoryItem = useCallback((id: string) => {
        setQueryHistory((prevHistory) =>
            prevHistory.filter((item) => item.id !== id),
        );
    }, []);

    const clearQueryHistory = useCallback(() => {
        setQueryHistory([]);
    }, []);

    const saveQuery = useCallback((input: SavedQueryInput) => {
        const nextSavedQuery = createSavedQuery(input);
        setSavedQueries((prevQueries) => [nextSavedQuery, ...prevQueries]);
        setSavedQueriesOpen(true);
        setHistoryOpen(false);
        setSaveQueryModalOpen(false);
    }, []);

    const deleteSavedQuery = useCallback((id: string) => {
        setSavedQueries((prevQueries) =>
            prevQueries.filter((query) => query.id !== id),
        );
    }, []);

    const handleToggleSavedQueryStar = useCallback((id: string) => {
        setSavedQueries((prevQueries) => toggleSavedQueryStar(prevQueries, id));
    }, []);

    const handleSelectSavedQuery = useCallback((savedQuery: SavedQuery) => {
        const currentTab = queryTabsRef.current?.getActiveTab();
        if (!currentTab) {
            return;
        }

        queryTabsRef.current?.updateQuery(savedQuery.query);

        if (
            savedQuery.environment &&
            currentTab.environment !== savedQuery.environment
        ) {
            queryTabsRef.current?.updateTabEnvironment(
                currentTab.id,
                savedQuery.environment,
            );
        }

        if (
            savedQuery.database &&
            currentTab.database !== savedQuery.database &&
            savedQuery.mode !== "workspace"
        ) {
            queryTabsRef.current?.updateTabDatabase(
                currentTab.id,
                savedQuery.database,
            );
        }

        setSavedQueriesOpen(false);
    }, []);

    const buildHistoryQuery = useCallback(
        (query: string, variables?: Record<string, string>) => {
            if (!variables || Object.keys(variables).length === 0) {
                return query;
            }

            const variableBlock = Object.entries(variables)
                .map(([name, value]) => `@${name} = ${value}`)
                .join("\n");

            return `${variableBlock}\n\n${query}`;
        },
        [],
    );

    const getPrimaryKeysForTable = useCallback(
        (table: { database: string; schema: string; name: string }) => {
            const standardKey = `${table.schema}.${table.name}`;
            if (primaryKeysByTable[standardKey]) {
                return primaryKeysByTable[standardKey];
            }

            const workspaceMatch = workspaceSchemas
                .find((dbSchema) => dbSchema.database === table.database)
                ?.schemas.find((schema) => schema.schema === table.schema)
                ?.tables.find(
                    (currentTable) => currentTable.name === table.name,
                );

            return workspaceMatch?.primaryKeys || [];
        },
        [primaryKeysByTable, workspaceSchemas],
    );

    const quoteIdentifier = useCallback((identifier: string) => {
        return `"${identifier.replace(/"/g, '""')}"`;
    }, []);

    const formatSqlLiteral = useCallback((value: unknown) => {
        if (value === null || typeof value === "undefined") {
            return "NULL";
        }

        if (typeof value === "string") {
            return `'${value.replace(/'/g, "''")}'`;
        }

        if (typeof value === "number") {
            return Number.isFinite(value) ? String(value) : "NULL";
        }

        if (typeof value === "bigint") {
            return value.toString();
        }

        if (typeof value === "boolean") {
            return value ? "TRUE" : "FALSE";
        }

        if (value instanceof Date) {
            return `'${value.toISOString().replace(/'/g, "''")}'`;
        }

        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }, []);

    const buildDeletePredicate = useCallback(
        (columnName: string, value: unknown) => {
            const identifier = quoteIdentifier(columnName);
            if (value === null || typeof value === "undefined") {
                return `${identifier} IS NULL`;
            }

            return `${identifier} = ${formatSqlLiteral(value)}`;
        },
        [formatSqlLiteral, quoteIdentifier],
    );

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

    // Restore persisted layout prefs after mount (avoids SSR hydration mismatch)
    useEffect(() => {
        const savedHeight = localStorage.getItem("editorHeight");
        if (savedHeight) {
            const h = parseInt(savedHeight, 10);
            if (!isNaN(h) && h > 0) setEditorHeight(h);
        }
        const savedCollapsed = localStorage.getItem("sidebarCollapsed");
        if (savedCollapsed === "true") setSidebarCollapsed(true);
    }, []);

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

            const cacheKey = `${activeTab.environment}:${activeTab.database}`;

            if (!forceRefresh) {
                const cached = tableColumnsCacheRef.current[cacheKey];
                if (
                    cached &&
                    Date.now() - cached.fetchedAt < TABLE_COLUMNS_CACHE_TTL_MS
                ) {
                    setTableColumns(cached.data.tableColumns);
                    setPrimaryKeysByTable(cached.data.primaryKeysByTable);
                    return;
                }

                if (tableColumnsInFlightRef.current[cacheKey]) {
                    setLoadingTables(true);
                    try {
                        const data =
                            await tableColumnsInFlightRef.current[cacheKey];
                        setTableColumns(data.tableColumns);
                        setPrimaryKeysByTable(data.primaryKeysByTable);
                    } catch (err) {
                        console.error("Failed to fetch tables/columns:", err);
                    } finally {
                        setLoadingTables(false);
                    }
                    return;
                }
            }

            setLoadingTables(true);
            try {
                const requestPromise = (async () => {
                    const columnsRes = await fetch("/api/columns", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            database: activeTab.database,
                            environment: activeTab.environment,
                            forceRefresh,
                        }),
                    });
                    const columnsData = await columnsRes.json();
                    if (columnsData.error) {
                        throw new Error(columnsData.error);
                    }
                    const data = {
                        tableColumns: columnsData.tableColumns as Record<
                            string,
                            Column[]
                        >,
                        primaryKeysByTable:
                            (columnsData.primaryKeysByTable as Record<
                                string,
                                string[]
                            >) || {},
                    };
                    tableColumnsCacheRef.current[cacheKey] = {
                        data,
                        fetchedAt: Date.now(),
                    };
                    return data;
                })();

                tableColumnsInFlightRef.current[cacheKey] = requestPromise;
                const data = await requestPromise;
                setTableColumns(data.tableColumns);
                setPrimaryKeysByTable(data.primaryKeysByTable);
            } catch (err) {
                console.error("Failed to fetch tables/columns:", err);
            } finally {
                delete tableColumnsInFlightRef.current[cacheKey];
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

    const handleTemplateOpen = useCallback(
        async (name: string) => {
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
                    queryTabsRef.current?.getActiveTab()?.environment ||
                    defaultEnvironment;
                queryTabsRef.current?.openWorkspaceTab({
                    name,
                    content: data.content,
                    environment: env,
                });
            } catch (err) {
                console.error("Failed to open template:", err);
                setError("Failed to open template.");
            }
        },
        [defaultEnvironment],
    );

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
            mode: "standard" | "workspace",
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
                if (mode === "workspace") {
                    // FROM database.table_name in workspace mode
                    return {
                        name: parts[1],
                        schema: "public",
                        database: parts[0],
                    };
                }

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
            explain = false,
        ) => {
            if (!query.trim()) return;

            setLoading(true);
            setResult(null);
            setExplainResult(null);
            setError(null);
            setExecutionTime(undefined);
            setTableViewerState(null);

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
                              explain,
                              timeoutMs: WORKSPACE_QUERY_TIMEOUT_MS,
                          }
                        : {
                              query,
                              database,
                              environment,
                              readOnly,
                              explain,
                          };

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                });
                const data: QueryResult | QueryError | ExplainResult =
                    await res.json();

                const endTime = performance.now();
                const execTime = Math.round(endTime - startTime);
                setExecutionTime(execTime);

                appendQueryHistory({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    query: buildHistoryQuery(query, variables),
                    database: isQueryError(data)
                        ? database || "workspace"
                        : data.routedDatabase || database || "workspace",
                    environment,
                    timestamp: Date.now(),
                    executionTime: execTime,
                    rowCount: "rowCount" in data ? data.rowCount : undefined,
                    success: !isQueryError(data),
                    error: isQueryError(data) ? data.error : undefined,
                });

                // Use startTransition for non-urgent UI updates (large datasets)
                startTransition(() => {
                    if (isQueryError(data)) {
                        setError(data.error);
                    } else if (isExplainResult(data)) {
                        setResult(null);
                        setExplainResult(data);
                        setCurrentTable(null);
                    } else {
                        setExplainResult(null);
                        setResult(data);

                        // Extract table info from SELECT queries to enable delete functionality
                        const tableInfo = extractTableFromQuery(
                            query,
                            database,
                            mode,
                        );
                        if (tableInfo) {
                            setCurrentTable({
                                ...tableInfo,
                                primaryKeys: getPrimaryKeysForTable(tableInfo),
                            });
                        }
                    }
                    setLoading(false);
                });
            } catch {
                setError("Failed to connect to the server.");
                setLoading(false);
            }
        },
        [
            appendQueryHistory,
            buildHistoryQuery,
            extractTableFromQuery,
            getPrimaryKeysForTable,
        ],
    );

    const runQuery = useCallback(
        async (
            query: string,
            environment: string,
            database: string,
            readOnly: boolean,
            mode: "standard" | "workspace" = "standard",
            variables?: Record<string, string>,
            explain = false,
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
                    explain,
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
                undefined,
                explain,
            );
        },
        [isWriteQuery, isProdEnvironment, executeQuery],
    );

    const loadTablePreview = useCallback(
        async (
            table: Table,
            environment: string,
            overrides?: Partial<
                Pick<
                    TableViewerState,
                    | "page"
                    | "pageSize"
                    | "sortColumn"
                    | "sortDirection"
                    | "searchQuery"
                >
            >,
        ) => {
            const targetDatabase = table.database || activeTab?.database;
            if (!targetDatabase) {
                return;
            }

            const isSameTable =
                currentTable?.database === targetDatabase &&
                currentTable?.schema === table.schema &&
                currentTable?.name === table.name;

            const baseState =
                isSameTable && tableViewerState
                    ? tableViewerState
                    : {
                          page: 1,
                          pageSize: DEFAULT_TABLE_VIEW_PAGE_SIZE,
                          totalRows: 0,
                          totalPages: 1,
                          sortColumn: null,
                          sortDirection: "asc" as const,
                          searchQuery: "",
                      };

            const nextRequest = {
                page: overrides?.page ?? baseState.page,
                pageSize: overrides?.pageSize ?? baseState.pageSize,
                sortColumn:
                    typeof overrides?.sortColumn === "undefined"
                        ? baseState.sortColumn
                        : overrides.sortColumn,
                sortDirection:
                    overrides?.sortDirection ?? baseState.sortDirection,
                searchQuery:
                    typeof overrides?.searchQuery === "undefined"
                        ? baseState.searchQuery
                        : overrides.searchQuery,
            };

            const previewTable = {
                name: table.name,
                schema: table.schema,
                database: targetDatabase,
                primaryKeys:
                    table.primaryKeys ||
                    getPrimaryKeysForTable({
                        database: targetDatabase,
                        schema: table.schema,
                        name: table.name,
                    }),
            };

            setLoading(true);
            setError(null);
            setExplainResult(null);
            setExecutionTime(undefined);
            setCurrentTable(previewTable);

            try {
                const res = await fetch("/api/table-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        environment,
                        database: targetDatabase,
                        schema: table.schema,
                        table: table.name,
                        page: nextRequest.page,
                        pageSize: nextRequest.pageSize,
                        sortColumn: nextRequest.sortColumn,
                        sortDirection: nextRequest.sortDirection,
                        searchQuery: nextRequest.searchQuery,
                    }),
                });

                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(
                        data.error || "Failed to load table preview.",
                    );
                }

                if (
                    data.totalRows > 0 &&
                    nextRequest.page > data.totalPages &&
                    data.totalPages > 0
                ) {
                    await loadTablePreview(table, environment, {
                        ...nextRequest,
                        page: data.totalPages,
                    });
                    return;
                }

                setResult({
                    rows: data.rows,
                    rowCount: data.rowCount,
                    fields: data.fields,
                });
                setTableViewerState({
                    page: data.page,
                    pageSize: data.pageSize,
                    totalRows: data.totalRows,
                    totalPages: data.totalPages,
                    sortColumn: data.sortColumn,
                    sortDirection: data.sortDirection,
                    searchQuery: data.searchQuery,
                });
            } catch (previewError) {
                setResult(null);
                setTableViewerState(null);
                setError(
                    previewError instanceof Error
                        ? previewError.message
                        : "Failed to load table preview.",
                );
            } finally {
                setLoading(false);
            }
        },
        [
            activeTab?.database,
            currentTable,
            getPrimaryKeysForTable,
            tableViewerState,
        ],
    );

    const handleTableViewChange = useCallback(
        async (
            updates: Partial<
                Pick<
                    TableViewerState,
                    | "page"
                    | "pageSize"
                    | "sortColumn"
                    | "sortDirection"
                    | "searchQuery"
                >
            >,
        ) => {
            if (!currentTable || !activeTab) {
                return;
            }

            await loadTablePreview(
                currentTable,
                activeTab.environment,
                updates,
            );
        },
        [activeTab, currentTable, loadTablePreview],
    );

    const refreshTablePreview = useCallback(async () => {
        if (!currentTable || !activeTab || !tableViewerState) {
            return;
        }

        await loadTablePreview(currentTable, activeTab.environment, {
            page: tableViewerState.page,
            pageSize: tableViewerState.pageSize,
            sortColumn: tableViewerState.sortColumn,
            sortDirection: tableViewerState.sortDirection,
            searchQuery: tableViewerState.searchQuery,
        });
    }, [activeTab, currentTable, loadTablePreview, tableViewerState]);

    const handleTablePreview = useCallback(
        (table: Table) => {
            const currentTab = queryTabsRef.current?.getActiveTab();
            if (!currentTab) return;

            const targetDatabase = table.database || currentTab.database;
            if (!targetDatabase) return;

            // Enable write mode for table preview (to allow delete)
            if (currentTab.readOnly) {
                queryTabsRef.current?.toggleTabReadOnly?.(currentTab.id);
            }

            void loadTablePreview(
                {
                    name: table.name,
                    schema: table.schema,
                    database: targetDatabase,
                    primaryKeys: table.primaryKeys,
                },
                currentTab.environment,
                {
                    page: 1,
                    pageSize: DEFAULT_TABLE_VIEW_PAGE_SIZE,
                    sortColumn: null,
                    sortDirection: "asc",
                    searchQuery: "",
                },
            );
        },
        [loadTablePreview],
    );

    // Handle delete row
    const handleDeleteRow = useCallback(
        async (row: Record<string, unknown>) => {
            if (!currentTable) {
                return;
            }

            const primaryKeys = currentTable.primaryKeys || [];
            const canUsePrimaryKeys =
                primaryKeys.length > 0 &&
                primaryKeys.every(
                    (columnName) =>
                        Object.prototype.hasOwnProperty.call(row, columnName) &&
                        row[columnName] != null,
                );

            const predicateColumns = canUsePrimaryKeys
                ? primaryKeys
                : Object.keys(row);
            const whereClauses = predicateColumns
                .map((columnName) =>
                    buildDeletePredicate(columnName, row[columnName]),
                )
                .join(" AND ");

            const fullTableName =
                currentTable.schema === "public"
                    ? quoteIdentifier(currentTable.name)
                    : `${quoteIdentifier(currentTable.schema)}.${quoteIdentifier(currentTable.name)}`;

            const deleteQuery = `DELETE FROM ${fullTableName} WHERE ${whereClauses};`;

            // Show confirmation dialog
            setDeleteConfirm({ row, query: deleteQuery });
        },
        [buildDeletePredicate, currentTable, quoteIdentifier],
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

        if (tableViewerState) {
            await loadTablePreview(currentTable, currentTab.environment, {
                page: tableViewerState.page,
                pageSize: tableViewerState.pageSize,
                sortColumn: tableViewerState.sortColumn,
                sortDirection: tableViewerState.sortDirection,
                searchQuery: tableViewerState.searchQuery,
            });
        } else {
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
        }

        setDeleteConfirm(null);
    }, [
        deleteConfirm,
        currentTable,
        loadTablePreview,
        runQuery,
        tableViewerState,
    ]);

    const runCurrentTab = useCallback(
        async (explain = false) => {
            const currentTab = queryTabsRef.current?.getActiveTab();
            if (!currentTab) {
                return;
            }

            if (currentTab.mode === "workspace") {
                try {
                    const { variables, sqlWithoutVars } = extractVariables(
                        currentTab.query,
                    );

                    if (Object.keys(variables).length > 0) {
                        validateVariableValues(variables);
                        validateVariableReferences(sqlWithoutVars, variables);
                    }

                    await runQuery(
                        sqlWithoutVars,
                        currentTab.environment,
                        currentTab.database,
                        currentTab.readOnly,
                        "workspace",
                        variables,
                        explain,
                    );
                } catch (currentError) {
                    setError(
                        currentError instanceof Error
                            ? currentError.message
                            : "Variable validation failed",
                    );
                }
                return;
            }

            await runQuery(
                currentTab.query,
                currentTab.environment,
                currentTab.database,
                currentTab.readOnly,
                currentTab.mode || "standard",
                undefined,
                explain,
            );
        },
        [runQuery],
    );

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

    const checkConnection = useCallback(async (environment: string) => {
        setConnected(false);
        setDbLatency(undefined);
        try {
            const res = await fetch(
                `/api/ping?environment=${encodeURIComponent(environment)}`,
            );
            const data = await res.json();
            setConnected(data.ok === true);
            if (data.ok && typeof data.latencyMs === "number") {
                setDbLatency(data.latencyMs);
            }
        } catch {
            setConnected(false);
        }
    }, []);

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
            setExplainResult(null);
            setError(null);
            setExecutionTime(undefined);
            setLoading(false);
            setCurrentTable(null);
            setTableViewerState(null);
            setDeleteConfirm(null);

            // Fetch databases for this tab's environment if not already cached
            await fetchDatabasesForEnvironment(tab.environment);

            // Check DB connectivity for the new environment
            checkConnection(tab.environment);
        },
        [fetchDatabasesForEnvironment, checkConnection],
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
                historyOpen={historyOpen}
                savedQueriesOpen={savedQueriesOpen}
                onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
                onToggleHistory={() => {
                    setHistoryOpen((prev) => !prev);
                    setSavedQueriesOpen(false);
                }}
                onToggleSavedQueries={() => {
                    setSavedQueriesOpen((prev) => !prev);
                    setHistoryOpen(false);
                }}
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
                                activeTab?.environment || defaultEnvironment
                            }
                            environmentNames={environmentNamesById}
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
                                primaryKeysByTable={primaryKeysByTable}
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
                                availableEnvironments={
                                    availableEnvironmentIds.length > 0
                                        ? availableEnvironmentIds
                                        : [defaultEnvironment]
                                }
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
                                        executionError={Boolean(error)}
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
                                className="h-[34px] flex items-center justify-between px-3 border-t flex-shrink-0"
                                style={{
                                    background: "var(--panel)",
                                    borderColor: "var(--border)",
                                    gap: "8px",
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    {activeTab?.mode === "workspace" && (
                                        <button
                                            onClick={handleSaveTemplate}
                                            className="cyber-btn cyber-btn-accent"
                                            title="Save or overwrite template"
                                        >
                                            save template
                                        </button>
                                    )}

                                    <button
                                        onClick={() => {
                                            setSaveQueryModalSeed(
                                                (prevSeed) => prevSeed + 1,
                                            );
                                            setSaveQueryModalOpen(true);
                                        }}
                                        disabled={!activeTab?.query.trim()}
                                        className="cyber-btn cyber-btn-warn"
                                        title="Save current query"
                                    >
                                        save query
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => fetchTablesAndColumns(true)}
                                        disabled={loadingTables}
                                        className="cyber-btn"
                                        title="Refresh autocomplete/intellisense data"
                                    >
                                        {loadingTables ? (
                                            <span className="flex items-center gap-1">
                                                <RefreshIcon className="w-3 h-3 animate-spin" />
                                                refreshing
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1">
                                                <RefreshIcon className="w-3 h-3" />
                                                intellisense
                                            </span>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => { void runCurrentTab(false); }}
                                        disabled={loading || !activeTab?.query.trim()}
                                        className="cyber-btn cyber-btn-accent"
                                        style={{ minWidth: "80px", justifyContent: "center" }}
                                    >
                                        {loading ? (
                                            <span className="flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 border border-current border-t-transparent animate-spin" />
                                                {executionTime !== undefined
                                                    ? `${(executionTime / 1000).toFixed(1)}s`
                                                    : "running"}
                                            </span>
                                        ) : (
                                            "run ⌘↵"
                                        )}
                                    </button>
                                    <button
                                        onClick={() => { void runCurrentTab(true); }}
                                        disabled={loading || !activeTab?.query.trim()}
                                        className="cyber-btn cyber-btn-warn"
                                        title="Run EXPLAIN ANALYZE"
                                    >
                                        explain
                                    </button>
                                </div>
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
                            {(result?.routedDatabase ||
                                explainResult?.routedDatabase) && (
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
                                        {result?.routedDatabase ||
                                            explainResult?.routedDatabase}
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
                                    ⚠ RESULTS TRUNCATED — SHOWING FIRST{" "}
                                    {result.rowCount.toLocaleString()}
                                    {result.totalRows
                                        ? ` OF ${result.totalRows.toLocaleString()}`
                                        : ""}{" "}
                                    ROWS · ADD A LIMIT CLAUSE TO REFINE
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                                {explainResult ? (
                                    <ExplainView
                                        plan={explainResult.explain}
                                        executionTime={
                                            explainResult.executionTime
                                        }
                                    />
                                ) : (
                                    <ResultsTable
                                        result={result}
                                        error={error}
                                        loading={loading}
                                        readOnly={activeTab?.readOnly ?? true}
                                        tableName={
                                            currentTable
                                                ? currentTable.schema ===
                                                  "public"
                                                    ? currentTable.name
                                                    : `${currentTable.schema}.${currentTable.name}`
                                                : undefined
                                        }
                                        tableView={tableViewerState}
                                        onTableViewChange={
                                            handleTableViewChange
                                        }
                                        onRefreshTableView={refreshTablePreview}
                                        onDeleteRow={handleDeleteRow}
                                    />
                                )}
                            </div>
                        </div>
                    </main>

                    <QueryHistory
                        items={queryHistory}
                        isOpen={historyOpen}
                        onToggle={() => {
                            setHistoryOpen((prev) => !prev);
                            setSavedQueriesOpen(false);
                        }}
                        onSelectQuery={(query) => {
                            queryTabsRef.current?.updateQuery(query);
                            setHistoryOpen(false);
                        }}
                        onDeleteItem={removeQueryHistoryItem}
                        onClear={clearQueryHistory}
                    />

                    <SavedQueries
                        items={savedQueries}
                        isOpen={savedQueriesOpen}
                        onToggle={() => {
                            setSavedQueriesOpen((prev) => !prev);
                            setHistoryOpen(false);
                        }}
                        onSelectQuery={handleSelectSavedQuery}
                        onDeleteItem={deleteSavedQuery}
                        onToggleStar={handleToggleSavedQueryStar}
                    />
                </div>

                {/* Status Bar */}
                <StatusBar
                    environment={activeTab?.environment || ""}
                    database={activeTab?.database || ""}
                    readOnly={activeTab?.readOnly || false}
                    rowCount={result?.rowCount}
                    executionTime={executionTime}
                    latency={dbLatency}
                    connected={connected}
                />
            </div>

            {/* Keyboard Help */}
            <KeyboardHelp />

            <SaveQueryModal
                key={saveQueryModalSeed}
                isOpen={saveQueryModalOpen}
                initialName={activeTab?.name || "Saved Query"}
                query={activeTab?.query || ""}
                environment={activeTab?.environment || defaultEnvironment}
                database={activeTab?.database || ""}
                mode={activeTab?.mode || "standard"}
                onSave={saveQuery}
                onCancel={() => setSaveQueryModalOpen(false)}
            />

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
