import { Pool, types as pgTypes, type CustomTypesConfig } from "pg";
import { environments, getDefaultEnvironment } from "./environments";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Date/time values are returned exactly as Postgres prints them. The default
// parsers turn `timestamp` (no time zone) into a JS Date in the Node
// process's zone, which then serialises as shifted UTC (10:00 IST shows as
// 04:30Z), and turn intervals into objects.
const RAW_DATETIME_OIDS = new Set([
    1082, // date
    1083, // time
    1114, // timestamp
    1184, // timestamptz
    1186, // interval
    1266, // timetz
]);
const RAW_DATETIME_ARRAY_OIDS = new Set([
    1182, // date[]
    1183, // time[]
    1115, // timestamp[]
    1185, // timestamptz[]
    1187, // interval[]
    1270, // timetz[]
]);
const TEXT_ARRAY_OID: number = 1009; // text[]: parse elements, keep them as strings

export const typeParsers: CustomTypesConfig = {
    getTypeParser: ((oid: number, format?: "text" | "binary") => {
        if (RAW_DATETIME_OIDS.has(oid)) {
            return (value: string) => value;
        }
        if (RAW_DATETIME_ARRAY_OIDS.has(oid)) {
            return pgTypes.getTypeParser(TEXT_ARRAY_OID, format);
        }
        return pgTypes.getTypeParser(oid, format);
    }) as CustomTypesConfig["getTypeParser"],
};

// One pool per environment + database, reused across requests so each query
// doesn't pay a fresh TCP + TLS handshake (slow over VPN). Kept on globalThis
// so Next.js dev hot reloads don't orphan pools.
const globalForPools = globalThis as typeof globalThis & {
    __pgLitePools?: Map<string, Pool>;
};
const pools = (globalForPools.__pgLitePools ??= new Map<string, Pool>());

const DEFAULT_STATEMENT_TIMEOUT_MS = 30000;

/**
 * Shared pool for an environment and database. Never call `end()` on it.
 * Routes that run user SQL must hand their client back through
 * `releaseAfterUserQuery` (lib/run-query.ts) so no session state leaks.
 *
 * @param environment - Environment ID (loadtest, sandbox, staging, etc.)
 * @param database - Optional database name (overrides environment default)
 */
export function getPool(
    environment: string = getDefaultEnvironment(),
    database?: string,
): Pool {
    const envConfig = environments[environment];

    // Never fall back to another environment: a typo must not silently run
    // SQL somewhere else.
    if (!envConfig) {
        throw new Error(`Unknown environment "${environment}".`);
    }

    const targetDatabase = database || envConfig.database;
    const key = `${environment}\u0000${targetDatabase}`;
    const existing = pools.get(key);
    if (existing) {
        return existing;
    }

    const pool = new Pool({
        host: envConfig.host,
        port: envConfig.port,
        user: envConfig.user,
        password: envConfig.password,
        database: targetDatabase,
        // Local Postgres usually has SSL off; forcing it fails with
        // "The server does not support SSL connections".
        ssl: LOCAL_HOSTS.has(envConfig.host)
            ? false
            : { rejectUnauthorized: false },
        // Session default for every connection (metadata routes included);
        // query routes override it per request, and DISCARD ALL restores it.
        statement_timeout: DEFAULT_STATEMENT_TIMEOUT_MS,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        types: typeParsers,
    });

    // An idle connection dropping (VPN off, DB restart) emits 'error' on the
    // pool; unhandled, that would crash the server process.
    pool.on("error", (error) => {
        console.error(
            `Idle connection error (${environment}/${targetDatabase}):`,
            error.message,
        );
    });

    pools.set(key, pool);
    return pool;
}
