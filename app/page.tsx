"use client";

import {
    useState,
    useCallback,
    useEffect,
    useRef,
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
}

interface QueryError {
    error: string;
    truncated?: boolean;
    rowCount?: number;
}

interface Table {
    schema: string;
    name: string;
}

interface Column {
    name: string;
    type: string;
    nullable: string;
}

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
    } | null>(null);
    const queryTabsRef = useRef<QueryTabsRef>(null);

    const [databasesByEnv, setDatabasesByEnv] = useState<
        Record<string, string[]>
    >({});
    const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>(
        {},
    );
    const [loadingTables, setLoadingTables] = useState(false);

    // Use refs to track in-flight requests and cache
    const databasesCacheRef = useRef<Record<string, string[]>>({});
    const inFlightRequestsRef = useRef<Record<string, Promise<string[]>>>({});

    // Fetch tables and columns for the active tab
    const fetchTablesAndColumns = useCallback(async () => {
        if (!activeTab || !activeTab.database) return;

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
    }, [activeTab]);

    // Fetch tables and columns when active tab's database or environment changes
    useEffect(() => {
        fetchTablesAndColumns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab?.database, activeTab?.environment]);

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

    const executeQuery = useCallback(
        async (
            query: string,
            environment: string,
            database: string,
            readOnly: boolean,
        ) => {
            if (!query.trim()) return;

            setLoading(true);
            setResult(null);
            setError(null);
            setExecutionTime(undefined);

            const startTime = performance.now();

            try {
                const res = await fetch("/api/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query,
                        database,
                        environment,
                        readOnly,
                    }),
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
                    }
                    setLoading(false);
                });
            } catch {
                setError("Failed to connect to the server.");
                setLoading(false);
            }
        },
        [],
    );

    const runQuery = useCallback(
        async (
            query: string,
            environment: string,
            database: string,
            readOnly: boolean,
        ) => {
            if (!query.trim()) return;

            // Check if this is a write query in production
            if (
                !readOnly &&
                isWriteQuery(query) &&
                isProdEnvironment(environment)
            ) {
                setPendingQuery({ query, environment, database, readOnly });
                setShowProdWarning(true);
                return;
            }

            // Execute query immediately
            await executeQuery(query, environment, database, readOnly);
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
            // Use active tab's environment and database for table preview
            runQuery(
                `SELECT * FROM ${fullTableName} LIMIT 100;`,
                currentTab.environment,
                currentTab.database,
                false, // table preview is always in write mode
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
            <ActivityBar />

            {/* Main Layout */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Query Tabs */}
                <div
                    className="border-b flex-shrink-0"
                    style={{ borderColor: "var(--border)" }}
                >
                    <QueryTabs
                        ref={queryTabsRef}
                        globalDatabase={activeTab?.database || ""}
                        globalEnvironment={activeTab?.environment || "loadtest"}
                        databases={
                            activeTab
                                ? databasesByEnv[activeTab.environment] || []
                                : []
                        }
                        onTabChange={handleTabChange}
                    />
                </div>

                {/* Content: Explorer | Editor + Results */}
                <div className="flex flex-1 min-h-0">
                    {/* Explorer Sidebar - 240px */}
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
                            onRefresh={fetchTablesAndColumns}
                            loading={loadingTables}
                        />
                    </aside>

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

                        {/* SQL Editor - 280px height */}
                        <div
                            className="h-[280px] flex-shrink-0 flex flex-col border-b"
                            style={{ borderColor: "var(--border)" }}
                        >
                            <div className="flex-1">
                                {activeTab && (
                                    <SQLEditor
                                        value={activeTab.query}
                                        onChange={(val) => {
                                            queryTabsRef.current?.updateQuery(
                                                val || "",
                                            );
                                        }}
                                        onRunQuery={() => {
                                            const currentTab =
                                                queryTabsRef.current?.getActiveTab();
                                            if (currentTab) {
                                                runQuery(
                                                    currentTab.query,
                                                    currentTab.environment,
                                                    currentTab.database,
                                                    currentTab.readOnly,
                                                );
                                            }
                                        }}
                                        tableColumns={tableColumns}
                                    />
                                )}
                            </div>

                            {/* Run Button Strip */}
                            <div
                                className="h-[32px] flex items-center px-3 text-[12px] border-t"
                                style={{
                                    background: "var(--panel)",
                                    borderColor: "var(--border)",
                                }}
                            >
                                <button
                                    onClick={() => {
                                        const currentTab =
                                            queryTabsRef.current?.getActiveTab();
                                        if (currentTab) {
                                            runQuery(
                                                currentTab.query,
                                                currentTab.environment,
                                                currentTab.database,
                                                currentTab.readOnly,
                                            );
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
                            </div>
                        </div>

                        {/* Results */}
                        <div className="flex-1 flex flex-col min-h-0">
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
                                />
                            </div>
                        </div>
                    </main>
                </div>

                {/* Status Bar */}
                <StatusBar
                    environment={activeTab?.environment || "loadtest"}
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
        </div>
    );
}
