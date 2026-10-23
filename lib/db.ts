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

const typeParsers: CustomTypesConfig = {
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

/**
 * Creates a new PostgreSQL connection pool for the specified environment and database.
 * No caching - each call creates a fresh pool. The Pool itself manages connection pooling internally.
 *
 * @param environment - Environment ID (loadtest, sandbox, staging, etc.)
 * @param database - Optional database name (overrides environment default)
 * @returns A new Pool instance
 */
export function createPool(
    environment: string = getDefaultEnvironment(),
    database?: string,
): Pool {
    const envConfig = environments[environment];

    // Never fall back to another environment: a typo must not silently run
    // SQL somewhere else.
    if (!envConfig) {
        throw new Error(`Unknown environment "${environment}".`);
    }

    return new Pool({
        host: envConfig.host,
        port: envConfig.port,
        user: envConfig.user,
        password: envConfig.password,
        database: database || envConfig.database,
        // Local Postgres usually has SSL off; forcing it fails with
        // "The server does not support SSL connections".
        ssl: LOCAL_HOSTS.has(envConfig.host)
            ? false
            : { rejectUnauthorized: false },
        // Connection pool settings
        max: 10, // Maximum 10 connections per pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        types: typeParsers,
    });
}
