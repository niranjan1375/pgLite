import { Pool } from "pg";
import { environments, getDefaultEnvironment } from "./environments";

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
    const defaultEnvironment = getDefaultEnvironment();
    const envConfig = environments[environment];

    if (!envConfig) {
        console.warn(
            `Environment "${environment}" not found, using ${defaultEnvironment} as fallback`,
        );
        return createPool(defaultEnvironment, database);
    }

    return new Pool({
        host: envConfig.host,
        port: envConfig.port,
        user: envConfig.user,
        password: envConfig.password,
        database: database || envConfig.database,
        ssl: {
            rejectUnauthorized: false,
        },
        // Connection pool settings
        max: 10, // Maximum 10 connections per pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
}

// Default pool for backward compatibility (not recommended for new code)
const pool = createPool(getDefaultEnvironment());

export default pool;
