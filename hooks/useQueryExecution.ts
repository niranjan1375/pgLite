import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { QueryHistoryItem } from "@/components/QueryHistory";
import { isWriteQuery } from "@/lib/sql-safety";
import { buildDeleteRowQuery, buildHistoryQuery } from "@/lib/sql-literal";
import {
    isExplainResult,
    isQueryError,
    type ExplainResult,
    type QueryRequest,
    type QueryResponse,
    type QueryResult,
    type Table,
    type TableViewUpdates,
    type TableViewerState,
    type ViewedTable,
} from "@/lib/query-types";

const WORKSPACE_QUERY_TIMEOUT_MS = 120000;
export const DEFAULT_TABLE_VIEW_PAGE_SIZE = 100;

const FIRST_PAGE: Required<TableViewUpdates> = {
    page: 1,
    pageSize: DEFAULT_TABLE_VIEW_PAGE_SIZE,
    sortColumn: null,
    sortDirection: "asc",
    searchQuery: "",
};

function newQueryId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function viewRequest(state: TableViewerState): Required<TableViewUpdates> {
    const { page, pageSize, sortColumn, sortDirection, searchQuery } = state;
    return { page, pageSize, sortColumn, sortDirection, searchQuery };
}

/**
 * Everything behind the results pane: running queries (with the
 * production-write confirm and cancellation), the paginated table viewer,
 * and primary-key row delete.
 */
export function useQueryExecution({
    activeTab,
    isProdEnvironment,
    getPrimaryKeys,
    onHistory,
    onQueryFinished,
}: {
    activeTab: { environment: string; database: string } | null;
    isProdEnvironment: (environment: string) => boolean;
    getPrimaryKeys: (table: {
        database: string;
        schema: string;
        name: string;
    }) => string[];
    onHistory: (item: QueryHistoryItem) => void;
    /** A query against `environment` finished: ok = it reached the database. */
    onQueryFinished?: (environment: string, ok: boolean) => void;
}) {
    const [result, setResult] = useState<QueryResult | null>(null);
    const [explainResult, setExplainResult] = useState<ExplainResult | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [executionTime, setExecutionTime] = useState<number | undefined>();
    const [pendingWrite, setPendingWrite] = useState<QueryRequest | null>(null);
    const [currentTable, setCurrentTable] = useState<ViewedTable | null>(null);
    const [tableViewerState, setTableViewerState] =
        useState<TableViewerState | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        row: Record<string, unknown>;
        query: string;
    } | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const currentQueryIdRef = useRef<string | null>(null);

    // Abort any in-flight fetch if the page unmounts (avoids orphaned promises
    // and setState-on-unmounted warnings).
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    /** Clear the results pane (tab, environment or database changed). */
    const resetResults = useCallback(() => {
        setResult(null);
        setExplainResult(null);
        setError(null);
        setExecutionTime(undefined);
        setLoading(false);
        setCurrentTable(null);
        setTableViewerState(null);
        setDeleteConfirm(null);
    }, []);

    const executeQuery = useCallback(
        async (request: QueryRequest) => {
            const {
                query,
                environment,
                database,
                readOnly,
                mode,
                variables,
                explain = false,
            } = request;
            if (!query.trim()) return;

            const controller = new AbortController();
            abortControllerRef.current = controller;
            const queryId = newQueryId();
            currentQueryIdRef.current = queryId;

            setLoading(true);
            setResult(null);
            setExplainResult(null);
            setError(null);
            setExecutionTime(undefined);
            setTableViewerState(null);

            const startTime = performance.now();

            try {
                // Workspace mode sends a structured payload with sql and variables
                const [endpoint, body] =
                    mode === "workspace"
                        ? [
                              "/api/workspace-query",
                              {
                                  sql: query,
                                  variables: variables || {},
                                  environment,
                                  readOnly,
                                  explain,
                                  queryId,
                                  timeoutMs: WORKSPACE_QUERY_TIMEOUT_MS,
                              },
                          ]
                        : [
                              "/api/query",
                              {
                                  query,
                                  database,
                                  environment,
                                  readOnly,
                                  explain,
                                  queryId,
                              },
                          ];

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                const data: QueryResponse = await res.json();

                const execTime = Math.round(performance.now() - startTime);
                setExecutionTime(execTime);

                const failed = isQueryError(data);
                onQueryFinished?.(environment, !failed);
                onHistory({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    query: buildHistoryQuery(query, variables),
                    database: failed
                        ? database || "workspace"
                        : data.routedDatabase || database || "workspace",
                    environment,
                    timestamp: Date.now(),
                    executionTime: execTime,
                    rowCount: "rowCount" in data ? data.rowCount : undefined,
                    success: !failed,
                    error: failed ? data.error : undefined,
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
                        // Row actions are only offered in the table viewer,
                        // where the row is known to come from exactly one table.
                        setExplainResult(null);
                        setResult(data);
                        setCurrentTable(null);
                    }
                    setLoading(false);
                });
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    // User cancelled — the fetch was aborted. Clear the spinner
                    // quietly; the server-side query is cancelled separately.
                    setError(null);
                } else {
                    setError("Failed to connect to the server.");
                    onQueryFinished?.(environment, false);
                }
                setLoading(false);
            } finally {
                if (abortControllerRef.current === controller) {
                    abortControllerRef.current = null;
                    currentQueryIdRef.current = null;
                }
            }
        },
        [onHistory, onQueryFinished],
    );

    /**
     * Run a query, stopping first for confirmation when it writes to a
     * production environment. In workspace mode `query` is the
     * variable-stripped SQL, so isWriteQuery sees the real verb. (Read-only
     * writes are already blocked server-side.)
     */
    const runQuery = useCallback(
        async (request: QueryRequest) => {
            if (!request.query.trim()) return;
            if (
                !request.readOnly &&
                !request.explain &&
                isWriteQuery(request.query) &&
                isProdEnvironment(request.environment)
            ) {
                setPendingWrite(request);
                return;
            }
            await executeQuery(request);
        },
        [executeQuery, isProdEnvironment],
    );

    const confirmPendingWrite = useCallback(() => {
        if (pendingWrite) void executeQuery(pendingWrite);
        setPendingWrite(null);
    }, [executeQuery, pendingWrite]);

    const cancelPendingWrite = useCallback(() => setPendingWrite(null), []);

    // Cancel the in-flight query: abort the fetch (frees the client) and ask
    // the server to pg_cancel_backend() the running query (frees the DB).
    const cancelQuery = useCallback(() => {
        abortControllerRef.current?.abort();
        const queryId = currentQueryIdRef.current;
        if (queryId) {
            void fetch("/api/cancel-query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queryId }),
            }).catch(() => {});
        }
    }, []);

    const loadTablePreview = useCallback(
        async (table: Table, environment: string, overrides?: TableViewUpdates) => {
            const targetDatabase = table.database || activeTab?.database;
            if (!targetDatabase) return;

            const isSameTable =
                currentTable?.database === targetDatabase &&
                currentTable?.schema === table.schema &&
                currentTable?.name === table.name;

            const base =
                isSameTable && tableViewerState
                    ? viewRequest(tableViewerState)
                    : FIRST_PAGE;
            const next = { ...base };
            for (const [key, value] of Object.entries(overrides ?? {})) {
                // An explicit `undefined` means "keep", same as an absent key.
                if (value !== undefined) Object.assign(next, { [key]: value });
            }

            setLoading(true);
            setError(null);
            setExplainResult(null);
            setExecutionTime(undefined);
            setCurrentTable({
                name: table.name,
                schema: table.schema,
                database: targetDatabase,
                primaryKeys:
                    table.primaryKeys ||
                    getPrimaryKeys({
                        database: targetDatabase,
                        schema: table.schema,
                        name: table.name,
                    }),
            });

            try {
                const res = await fetch("/api/table-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        environment,
                        database: targetDatabase,
                        schema: table.schema,
                        table: table.name,
                        ...next,
                    }),
                });

                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(
                        data.error || "Failed to load table preview.",
                    );
                }

                // Past the last page (rows were deleted, or a filter shrank
                // the table): reload the last page instead.
                if (
                    data.totalRows > 0 &&
                    data.totalPages > 0 &&
                    next.page > data.totalPages
                ) {
                    await loadTablePreview(table, environment, {
                        ...next,
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
        [activeTab?.database, currentTable, getPrimaryKeys, tableViewerState],
    );

    const previewTable = useCallback(
        (table: Table) => {
            if (!activeTab) return;
            void loadTablePreview(table, activeTab.environment, FIRST_PAGE);
        },
        [activeTab, loadTablePreview],
    );

    const changeTableView = useCallback(
        async (updates: TableViewUpdates) => {
            if (!currentTable || !activeTab) return;
            await loadTablePreview(currentTable, activeTab.environment, updates);
        },
        [activeTab, currentTable, loadTablePreview],
    );

    const refreshTableView = useCallback(async () => {
        if (!currentTable || !activeTab || !tableViewerState) return;
        await loadTablePreview(
            currentTable,
            activeTab.environment,
            viewRequest(tableViewerState),
        );
    }, [activeTab, currentTable, loadTablePreview, tableViewerState]);

    // Row deletion is only offered in the table viewer (one known table) and
    // only by primary key, so a predicate can never match the wrong row.
    const canDeleteRows = Boolean(
        tableViewerState && currentTable?.primaryKeys?.length,
    );

    const requestDeleteRow = useCallback(
        (row: Record<string, unknown>) => {
            if (!currentTable) return;
            const built = buildDeleteRowQuery(
                currentTable,
                currentTable.primaryKeys || [],
                row,
            );
            if ("error" in built) {
                setError(built.error);
                return;
            }
            setDeleteConfirm({ row, query: built.query });
        },
        [currentTable],
    );

    // Execute delete after confirmation. Runs against the table's own
    // database via the standard route, then refreshes the viewer.
    const confirmDelete = useCallback(async () => {
        if (!deleteConfirm || !currentTable || !tableViewerState || !activeTab)
            return;

        const { query } = deleteConfirm;
        const viewState = tableViewerState;
        setDeleteConfirm(null);

        try {
            const res = await fetch("/api/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    environment: activeTab.environment,
                    database: currentTable.database,
                    readOnly: false,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || "Failed to delete row.");
                return;
            }
        } catch {
            setError("Failed to connect to the server.");
            return;
        }

        await loadTablePreview(
            currentTable,
            activeTab.environment,
            viewRequest(viewState),
        );
    }, [activeTab, deleteConfirm, currentTable, loadTablePreview, tableViewerState]);

    const cancelDelete = useCallback(() => setDeleteConfirm(null), []);

    return {
        result,
        explainResult,
        error,
        setError,
        loading,
        executionTime,
        resetResults,
        runQuery,
        cancelQuery,
        pendingWrite,
        confirmPendingWrite,
        cancelPendingWrite,
        currentTable,
        tableViewerState,
        previewTable,
        changeTableView,
        refreshTableView,
        canDeleteRows,
        deleteConfirm,
        requestDeleteRow,
        confirmDelete,
        cancelDelete,
    };
}
