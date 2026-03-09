import { Pool } from "pg";
import { environments } from "./environments";

/**
 * Creates a new PostgreSQL connection pool for the specified environment and database.
 * No caching - each call creates a fresh pool. The Pool itself manages connection pooling internally.
 *
 * @param environment - Environment ID (loadtest, sandbox, staging, etc.)
 * @param database - Optional database name (overrides environment default)
 * @returns A new Pool instance
 */
export function createPool(
    environment: string = "loadtest",
    database?: string,
): Pool {
    const envConfig = environments[environment];

    if (!envConfig) {
        console.warn(
            `Environment "${environment}" not found, using loadtest as fallback`,
        );
        return createPool("loadtest", database);
    }

    // Temporary debug logging
    if (environment === "sandbox") {
        console.log("🔐 Sandbox connection details:", {
            host: envConfig.host,
            port: envConfig.port,
            user: envConfig.user,
            passwordLength: envConfig.password?.length,
            passwordStart: envConfig.password?.substring(0, 5),
            database: database || envConfig.database,
        });
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
const pool = createPool("loadtest");

export default pool;
