import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Column, QueryMode, WorkspaceSchema } from "@/lib/query-types";

// The server keeps schemas (on disk too) and answers from its cache, so
// after this long the client just asks again — quietly, in the background.
const SCHEMA_REVALIDATE_AFTER_MS = 60_000;

interface StandardSchemaPayload {
    tableColumns: Record<string, Column[]>;
    primaryKeysByTable: Record<string, string[]>;
}

interface TimedCache<T> {
    entries: Partial<Record<string, { data: T; fetchedAt: number }>>;
    inFlight: Partial<Record<string, Promise<T>>>;
}

function cachedEntry<T>(cache: TimedCache<T>, key: string) {
    const hit = cache.entries[key];
    return hit
        ? {
              data: hit.data,
              stale: Date.now() - hit.fetchedAt > SCHEMA_REVALIDATE_AFTER_MS,
          }
        : undefined;
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

            const seq = ++requestSeqRef.current;
            const isLatest = () => requestSeqRef.current === seq;

            // Show whatever is cached at once; only an empty cache (or the
            // refresh button) shows the spinner. A stale entry is refetched
            // in the background and swapped in when it arrives.
            const load = async <T,>(
                cache: TimedCache<T>,
                key: string,
                fetcher: () => Promise<T>,
                apply: (data: T) => void,
                label: string,
            ) => {
                const hit = forceRefresh ? undefined : cachedEntry(cache, key);
                if (hit) {
                    apply(hit.data);
                    setLoadingTables(false);
                    if (!hit.stale) return;
                } else {
                    setLoadingTables(true);
                }
                try {
                    const data = await loadShared(cache, key, forceRefresh, fetcher);
                    if (isLatest()) apply(data);
                } catch (err) {
                    console.error(`Failed to fetch ${label}:`, err);
                } finally {
                    if (isLatest() && !hit) setLoadingTables(false);
                }
            };

            if (workspace) {
                await load(
                    workspaceCacheRef.current,
                    environment,
                    () => fetchWorkspaceSchemas(environment, forceRefresh),
                    setWorkspaceSchemas,
                    "workspace schemas",
                );
                return;
            }

            await load(
                standardCacheRef.current,
                `${environment}:${database}`,
                () => fetchStandardSchema(environment, database!, forceRefresh),
                (data) => {
                    setTableColumns(data.tableColumns);
                    setPrimaryKeysByTable(data.primaryKeysByTable);
                },
                "tables/columns",
            );
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
