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
import { type QueryTab, type QueryTabsRef } from "@/components/QueryTabs";

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
    const [activeTab, setActiveTab] = useState<QueryTab | null>(null);
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

    // Fetch tables and columns when active tab's database or environment changes
    useEffect(() => {
        if (!activeTab || !activeTab.database) return;

        const fetchTablesAndColumns = async () => {
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
        };
        fetchTablesAndColumns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab?.database, activeTab?.environment]);

    const runQuery = useCallback(
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
            // Fetch databases for this tab's environment if not already cached
            await fetchDatabasesForEnvironment(tab.environment);
        },
        [fetchDatabasesForEnvironment],
    );

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
            {/* Query Tabs - Full Width */}
            <div className="border-b border-gray-800 flex-shrink-0 bg-gray-900">
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

            {/* Main content area: Sidebar + Editor + Results */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar - Schema Browser */}
                <aside className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
                    <DatabaseTree
                        databases={[]}
                        selectedDatabase={activeTab?.database || ""}
                        tableColumns={tableColumns}
                        onTablePreview={handleTablePreview}
                        loading={loadingTables}
                    />
                </aside>

                {/* Editor + Results area */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {/* SQL Editor */}
                    <div className="h-80 border-b border-gray-800 flex-shrink-0 flex flex-col">
                        <div className="flex-1 overflow-auto">
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
                        <div className="flex items-center gap-2 p-2 border-t border-gray-800">
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
                                disabled={loading || !activeTab?.query.trim()}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700
                                           disabled:cursor-not-allowed rounded text-sm font-medium
                                           transition-colors"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <svg
                                            className="animate-spin h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            />
                                        </svg>
                                        Running...
                                    </span>
                                ) : (
                                    "Run Query"
                                )}
                            </button>
                            <div className="text-xs text-gray-500">
                                Press{" "}
                                <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded">
                                    Cmd+Enter
                                </kbd>{" "}
                                to run
                            </div>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {result?.truncated && (
                            <div className="bg-yellow-600 text-black px-4 py-2 text-sm font-medium flex items-center gap-2">
                                <svg
                                    className="w-5 h-5"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                ⚠️ Results limited to{" "}
                                {result.rowCount.toLocaleString()} rows. Refine
                                your query with a WHERE clause or LIMIT for
                                better performance.
                            </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                            <ResultsTable
                                result={result}
                                error={error}
                                loading={loading}
                            />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
