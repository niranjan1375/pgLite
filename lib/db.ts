import { Pool } from "pg";
import { environments, getDefaultEnvironment } from "./environments";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
    });
}
