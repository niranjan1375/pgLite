import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "./environments";

// Schema metadata (databases, tables, columns, primary keys) for autocomplete
// and the explorer. Schemas change rarely, and loading them over VPN takes
// seconds, so this is stale-while-revalidate: anything cached is returned
// immediately, and an entry older than SCHEMA_STALE_AFTER_MS is refreshed in
// the background for next time. Entries are also written to
// .pgconsole/schema-cache/ (gitignored, names only — no row data), so they
// survive server restarts.

export const SCHEMA_STALE_AFTER_MS = 10 * 60_000;
// Bump when the cached shape changes so old disk entries are ignored
// (v2: primaryKeys are arrays; v1 stored Postgres' "{id}" text form).
const SCHEMA_CACHE_VERSION = "v2";
const CACHE_DIR =
    process.env.PGLITE_SCHEMA_CACHE_DIR ||
    path.join(process.cwd(), ".pgconsole", "schema-cache");

interface Entry<T> {
    data: T;
    cachedAt: number;
}

export interface CachedSchema<T> extends Entry<T> {
    stale: boolean;
}

interface Store {
    memory: Map<string, Entry<unknown>>;
    inFlight: Map<string, Promise<Entry<unknown>>>;
}

// On globalThis so dev-mode module reloads keep the cache.
const globalStore = globalThis as typeof globalThis & {
    __pgliteSchemaCache?: Store;
};
const store = (globalStore.__pgliteSchemaCache ??= {
    memory: new Map(),
    inFlight: new Map(),
});

/**
 * Cache key for an environment's schema. Includes the host so that pointing
 * an environment id at a different server never serves the old server's schema.
 */
export function schemaCacheKey(kind: string, environment: string, database = "") {
    const host = getEnvironment(environment)?.host ?? "";
    return [SCHEMA_CACHE_VERSION, kind, environment, host, database].join(":");
}

function fileFor(key: string) {
    return path.join(CACHE_DIR, `${encodeURIComponent(key)}.json`);
}

async function readDisk<T>(key: string): Promise<Entry<T> | undefined> {
    try {
        const entry = JSON.parse(await readFile(fileFor(key), "utf8"));
        if (typeof entry?.cachedAt === "number" && "data" in entry) {
            return entry as Entry<T>;
        }
    } catch {
        // Missing or unreadable: treat as a cache miss.
    }
    return undefined;
}

let writeSeq = 0;

async function writeDisk(key: string, entry: Entry<unknown>) {
    try {
        await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
        const file = fileFor(key);
        const tmp = `${file}.${process.pid}.${++writeSeq}.tmp`;
        await writeFile(tmp, JSON.stringify(entry), { mode: 0o600 });
        // A newer entry replaced this one while it was being written: drop
        // it, so an older schema never lands on disk after a newer one.
        if (store.memory.get(key) !== entry) {
            await rm(tmp, { force: true });
            return;
        }
        await rename(tmp, file);
    } catch (err) {
        console.error("Failed to persist schema cache:", key, err);
    }
}

// One load per key at a time; concurrent callers share it.
function refresh<T>(key: string, load: () => Promise<T>): Promise<Entry<T>> {
    const pending = store.inFlight.get(key);
    if (pending) return pending as Promise<Entry<T>>;

    const request = (async () => {
        const entry: Entry<T> = { data: await load(), cachedAt: Date.now() };
        store.memory.set(key, entry);
        void writeDisk(key, entry);
        return entry;
    })();
    store.inFlight.set(key, request);
    request
        .finally(() => store.inFlight.delete(key))
        .catch(() => {});
    return request;
}

export async function cachedSchema<T>(
    key: string,
    load: () => Promise<T>,
    { force = false }: { force?: boolean } = {},
): Promise<CachedSchema<T>> {
    if (!force) {
        let entry = store.memory.get(key) as Entry<T> | undefined;
        if (!entry) {
            entry = await readDisk<T>(key);
            if (entry) store.memory.set(key, entry);
        }
        if (entry) {
            const stale = Date.now() - entry.cachedAt > SCHEMA_STALE_AFTER_MS;
            if (stale) {
                refresh(key, load).catch((err) =>
                    console.error("Background schema refresh failed:", key, err),
                );
            }
            return { ...entry, stale };
        }
    }
    const entry = await refresh(key, load);
    return { ...entry, stale: false };
}

/** Run `fn` over `items` with at most `limit` in flight; results keep order. */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return results;
}
