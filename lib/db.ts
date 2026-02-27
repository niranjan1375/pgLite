import { Pool } from "pg";
import { environments, Environment } from "./environments";

// Global pool cache to reuse connections
const poolCache = new Map<string, Pool>();

export function getPool(environment: string = "loadtest"): Pool {
    // Check if pool already exists in cache
    if (poolCache.has(environment)) {
        return poolCache.get(environment)!;
    }

    // Get environment configuration
    const envConfig = environments[environment];

    if (!envConfig) {
        console.warn(
            `Environment "${environment}" not found, using loadtest as fallback`,
        );
        return getPool("loadtest");
    }

    // Create new pool
    const pool = new Pool({
        host: envConfig.host,
        port: envConfig.port,
        user: envConfig.user,
        password: envConfig.password,
        database: envConfig.database,
        ssl: {
            rejectUnauthorized: false,
        },
    });

    // Cache the pool
    poolCache.set(environment, pool);

    return pool;
}

// Default pool for backward compatibility
const pool = getPool("loadtest");

export default pool;
