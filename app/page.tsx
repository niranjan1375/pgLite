"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import DatabaseTree from "@/components/DatabaseTree";
import ResultsTable from "@/components/ResultsTable";

const QueryTabs = dynamic(() => import("@/components/QueryTabs"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-gray-500">
            Loading...
        </div>
    ),
});

interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: string[];
}

interface QueryError {
    error: string;
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

    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string>("");
    const selectedDatabaseRef = useRef<string>("");
    const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>(
        {},
    );
    const [loadingDatabases, setLoadingDatabases] = useState(false);
    const [loadingTables, setLoadingTables] = useState(false);

    // Keep ref in sync with state
    useEffect(() => {
        selectedDatabaseRef.current = selectedDatabase;
    }, [selectedDatabase]);

    // Fetch databases on mount
    useEffect(() => {
        const fetchDatabases = async () => {
            setLoadingDatabases(true);
            try {
                const res = await fetch("/api/databases");
                const data = await res.json();
                if (!data.error) {
                    setDatabases(data.databases);
                    // Set default database
                    const defaultDb =
                        process.env.NEXT_PUBLIC_POSTGRES_DB ||
                        data.databases[0];
                    setSelectedDatabase(defaultDb);
                }
            } catch (err) {
                console.error("Failed to fetch databases:", err);
            } finally {
                setLoadingDatabases(false);
            }
        };
        fetchDatabases();
    }, []);

    // Fetch tables and columns when database changes
    useEffect(() => {
        if (!selectedDatabase) return;

        const fetchTablesAndColumns = async () => {
            setLoadingTables(true);
            try {
                const columnsRes = await fetch("/api/columns", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ database: selectedDatabase }),
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
    }, [selectedDatabase]);

    const runQuery = useCallback(
        async (query: string) => {
            if (!query.trim()) return;

            setLoading(true);
            setResult(null);
            setError(null);

            const currentDatabase = selectedDatabaseRef.current;

            try {
                const res = await fetch("/api/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query,
                        database: currentDatabase,
                    }),
                });
                const data: QueryResult | QueryError = await res.json();
                if ("error" in data) {
                    setError(data.error);
                } else {
                    setResult(data);
                }
            } catch {
                setError("Failed to connect to the server.");
            } finally {
                setLoading(false);
            }
        },
        [], // No dependencies since we're using ref
    );

    const handleTablePreview = useCallback(
        (table: Table) => {
            const fullTableName =
                table.schema === "public"
                    ? table.name
                    : `${table.schema}.${table.name}`;
            runQuery(`SELECT * FROM ${fullTableName} LIMIT 100;`);
        },
        [runQuery],
    );

    return (
        <div className="flex h-screen bg-gray-950 text-gray-100">
            {/* Sidebar */}
            <aside className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
                <div className="p-4 border-b border-gray-800">
                    <h1 className="text-xl font-bold text-blue-400 tracking-tight">
                        pgLite
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        PostgreSQL Database Manager
                    </p>
                </div>

                <DatabaseTree
                    databases={databases}
                    selectedDatabase={selectedDatabase}
                    onDatabaseChange={setSelectedDatabase}
                    tableColumns={tableColumns}
                    onTablePreview={handleTablePreview}
                    loading={loadingDatabases || loadingTables}
                />
            </aside>

            {/* Main area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Query Editor with Tabs */}
                <div className="h-80 border-b border-gray-800 flex-shrink-0">
                    <QueryTabs
                        tableColumns={tableColumns}
                        onRunQuery={runQuery}
                        loading={loading}
                        selectedDatabase={selectedDatabase}
                    />
                </div>

                {/* Results area */}
                <div className="flex-1 overflow-hidden">
                    <ResultsTable
                        result={result}
                        error={error}
                        loading={loading}
                    />
                </div>
            </main>
        </div>
    );
}
