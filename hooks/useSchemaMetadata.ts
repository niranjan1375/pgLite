import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Column, QueryMode, WorkspaceSchema } from "@/lib/query-types";

const WORKSPACE_SCHEMA_CACHE_TTL_MS = 120_000;
const TABLE_COLUMNS_CACHE_TTL_MS = 5 * 60_000; // 5 minutes, matches server-side cache

interface StandardSchemaPayload {
    tableColumns: Record<string, Column[]>;
    primaryKeysByTable: Record<string, string[]>;
}

interface TimedCache<T> {
    entries: Partial<Record<string, { data: T; fetchedAt: number }>>;
    inFlight: Partial<Record<string, Promise<T>>>;
}

function freshEntry<T>(cache: TimedCache<T>, key: string, ttlMs: number) {
    const hit = cache.entries[key];
    return hit && Date.now() - hit.fetchedAt < ttlMs ? hit.data : undefined;
}

// Joins an in-flight request for the same key unless forced.
async function loadShared<T>(
    cache: TimedCache<T>,
    key: string,
    force: boolean,
    fetcher: () => Promise<T>,
): Promise<T> {
    const pending = cache.inFlight[key];
    if (!force && pending) return pending;

    const request = fetcher().then((data) => {
        cache.entries[key] = { data, fetchedAt: Date.now() };
        return data;
    });
    cache.inFlight[key] = request;
    try {
        return await request;
    } finally {
        if (cache.inFlight[key] === request) delete cache.inFlight[key];
    }
}

async function fetchWorkspaceSchemas(environment: string, force: boolean) {
    const res = await fetch(
        `/api/workspace-schemas?environment=${encodeURIComponent(environment)}${force ? "&refresh=1" : ""}`,
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return (data.schemas || []) as WorkspaceSchema[];
}

async function fetchStandardSchema(
    environment: string,
    database: string,
    forceRefresh: boolean,
): Promise<StandardSchemaPayload> {
    const res = await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database, environment, forceRefresh }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return {
        tableColumns: data.tableColumns as Record<string, Column[]>,
        primaryKeysByTable:
            (data.primaryKeysByTable as Record<string, string[]>) || {},
    };
}

interface SchemaTarget {
    environment: string;
    database: string;
    mode?: QueryMode;
}

/**
 * Databases per environment plus tables/columns/primary keys for the active
 * tab (one database, or every database in workspace mode) — feeds the
 * explorer tree and editor autocomplete.
 */
export function useSchemaMetadata(target: SchemaTarget | null) {
    const [databasesByEnv, setDatabasesByEnv] = useState<
        Record<string, string[]>
    >({});
    const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>(
        {},
    );
    const [primaryKeysByTable, setPrimaryKeysByTable] = useState<
        Record<string, string[]>
    >({});
    const [workspaceSchemas, setWorkspaceSchemas] = useState<WorkspaceSchema[]>(
        [],
    );
    const [loadingTables, setLoadingTables] = useState(false);

    const databasesCacheRef = useRef<Record<string, string[]>>({});
    const databasesInFlightRef = useRef<Record<string, Promise<string[]>>>({});
    const workspaceCacheRef = useRef<TimedCache<WorkspaceSchema[]>>({
        entries: {},
        inFlight: {},
    });
    const standardCacheRef = useRef<TimedCache<StandardSchemaPayload>>({
        entries: {},
        inFlight: {},
    });
    // Only the latest request may update state, so a slow response for a tab
    // you already left can't overwrite the current tab's autocomplete.
    const requestSeqRef = useRef(0);

    const environment = target?.environment;
    const database = target?.database;
    const workspace = target?.mode === "workspace";

    const refreshSchema = useCallback(
        async (forceRefresh = false) => {
            if (!environment) return;
            if (!workspace && !database) return;

            const applyWorkspace = (schemas: WorkspaceSchema[]) =>
                setWorkspaceSchemas(schemas);
            const applyStandard = (data: StandardSchemaPayload) => {
                setTableColumns(data.tableColumns);
                setPrimaryKeysByTable(data.primaryKeysByTable);
            };

            const seq = ++requestSeqRef.current;
            const isLatest = () => requestSeqRef.current === seq;

            if (workspace) {
                const cache = workspaceCacheRef.current;
                const hit = forceRefresh
                    ? undefined
                    : freshEntry(cache, environment, WORKSPACE_SCHEMA_CACHE_TTL_MS);
                if (hit) return applyWorkspace(hit);

                setLoadingTables(true);
                try {
                    const schemas = await loadShared(
                        cache,
                        environment,
                        forceRefresh,
                        () => fetchWorkspaceSchemas(environment, forceRefresh),
                    );
                    if (isLatest()) applyWorkspace(schemas);
                } catch (err) {
                    console.error("Failed to fetch workspace schemas:", err);
                } finally {
                    if (isLatest()) setLoadingTables(false);
                }
                return;
            }

            const key = `${environment}:${database}`;
            const cache = standardCacheRef.current;
            const hit = forceRefresh
                ? undefined
                : freshEntry(cache, key, TABLE_COLUMNS_CACHE_TTL_MS);
            if (hit) return applyStandard(hit);

            setLoadingTables(true);
            try {
                const data = await loadShared(cache, key, forceRefresh, () =>
                    fetchStandardSchema(environment, database!, forceRefresh),
                );
                if (isLatest()) applyStandard(data);
            } catch (err) {
                console.error("Failed to fetch tables/columns:", err);
            } finally {
                if (isLatest()) setLoadingTables(false);
            }
        },
        [environment, database, workspace],
    );

    useEffect(() => {
        void refreshSchema();
    }, [refreshSchema]);

    // Databases per environment: cached for the session once fetched.
    const fetchDatabases = useCallback(async (env: string) => {
        const cached = databasesCacheRef.current[env];
        if (cached) return cached;
        const pending = databasesInFlightRef.current[env];
        if (pending) return pending;

        const request = (async () => {
            try {
                const res = await fetch(
                    `/api/databases?environment=${encodeURIComponent(env)}`,
                );
                const data = await res.json();
                if (!data.error) {
                    databasesCacheRef.current[env] = data.databases;
                    setDatabasesByEnv((prev) => ({
                        ...prev,
                        [env]: data.databases,
                    }));
                    return data.databases as string[];
                }
            } catch (err) {
                console.error(`Failed to fetch databases for ${env}:`, err);
            } finally {
                delete databasesInFlightRef.current[env];
            }
            return [];
        })();

        databasesInFlightRef.current[env] = request;
        return request;
    }, []);

    const getPrimaryKeys = useCallback(
        (table: { database: string; schema: string; name: string }) =>
            primaryKeysByTable[`${table.schema}.${table.name}`] ??
            workspaceSchemas
                .find((db) => db.database === table.database)
                ?.schemas.find((schema) => schema.schema === table.schema)
                ?.tables.find((t) => t.name === table.name)?.primaryKeys ??
            [],
        [primaryKeysByTable, workspaceSchemas],
    );

    // Autocomplete keys: `schema.table`, or `db.schema.table` in workspace mode.
    const editorTableColumns = useMemo(() => {
        if (!workspace || workspaceSchemas.length === 0) return tableColumns;
        const columns: Record<string, Column[]> = {};
        for (const db of workspaceSchemas) {
            for (const schema of db.schemas) {
                for (const table of schema.tables) {
                    columns[`${db.database}.${schema.schema}.${table.name}`] =
                        table.columns;
                }
            }
        }
        return columns;
    }, [workspace, workspaceSchemas, tableColumns]);

    return {
        databasesByEnv,
        fetchDatabases,
        tableColumns,
        primaryKeysByTable,
        workspaceSchemas,
        loadingTables,
        refreshSchema,
        getPrimaryKeys,
        editorTableColumns,
    };
}
