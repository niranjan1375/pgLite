export interface Environment {
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    requiresVPN?: boolean;
}

export const environments: Record<string, Environment> = {
    loadtest: {
        name: "Loadtest Azure",
        host: process.env.LOADTEST_HOST || "",
        port: parseInt(process.env.LOADTEST_PORT || "5432"),
        user: process.env.LOADTEST_USER || "",
        password: process.env.LOADTEST_PASSWORD || "",
        database: process.env.LOADTEST_DB || "",
        requiresVPN: false,
    },
    sandbox: {
        name: "Sandbox",
        host: process.env.SANDBOX_HOST || "",
        port: parseInt(process.env.SANDBOX_PORT || "5432"),
        user: process.env.SANDBOX_USER || "",
        password: process.env.SANDBOX_PASSWORD || "",
        database: process.env.SANDBOX_DB || "",
        requiresVPN: false,
    },
    staging: {
        name: "Staging",
        host: process.env.STAGING_HOST || "",
        port: parseInt(process.env.STAGING_PORT || "5432"),
        user: process.env.STAGING_USER || "",
        password: process.env.STAGING_PASSWORD || "",
        database: process.env.STAGING_DB || "",
        requiresVPN: false,
    },
    "vegapay-uat-snapshot": {
        name: "VegaPay UAT Snapshot",
        host: process.env.VEGAPAY_UAT_SNAPSHOT_HOST || "",
        port: parseInt(process.env.VEGAPAY_UAT_SNAPSHOT_PORT || "5432"),
        user: process.env.VEGAPAY_UAT_SNAPSHOT_USER || "",
        password: process.env.VEGAPAY_UAT_SNAPSHOT_PASSWORD || "",
        database: process.env.VEGAPAY_UAT_SNAPSHOT_DB || "",
        requiresVPN: true,
    },
    "vegapay-uat": {
        name: "VegaPay UAT",
        host: process.env.VEGAPAY_UAT_HOST || "",
        port: parseInt(process.env.VEGAPAY_UAT_PORT || "5432"),
        user: process.env.VEGAPAY_UAT_USER || "",
        password: process.env.VEGAPAY_UAT_PASSWORD || "",
        database: process.env.VEGAPAY_UAT_DB || "",
        requiresVPN: true,
    },
    "unity-uat": {
        name: "Unity UAT",
        host: process.env.UNITY_UAT_HOST || "",
        port: parseInt(process.env.UNITY_UAT_PORT || "5432"),
        user: process.env.UNITY_UAT_USER || "",
        password: process.env.UNITY_UAT_PASSWORD || "",
        database: process.env.UNITY_UAT_DB || "",
        requiresVPN: true,
    },
    dev: {
        name: "Development (Local)",
        host: process.env.DEV_HOST || "localhost",
        port: parseInt(process.env.DEV_PORT || "5432"),
        user: process.env.DEV_USER || "postgres",
        password: process.env.DEV_PASSWORD || "",
        database: process.env.DEV_DB || "postgres",
        requiresVPN: false,
    },
};

export function getEnvironment(env: string): Environment | null {
    return environments[env] || null;
}

export function getAllEnvironments(): string[] {
    return Object.keys(environments);
}

/**
 * Validates that required environment variables are set
 * Call this on app startup to fail fast
 */
export function validateEnvironments(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    Object.entries(environments).forEach(([envKey, env]) => {
        if (!env.host) {
            errors.push(`Missing ${envKey.toUpperCase()}_HOST`);
        }
        if (!env.user) {
            errors.push(`Missing ${envKey.toUpperCase()}_USER`);
        }
        // Password can be empty for some environments (like local dev with trust auth)
        if (!env.database) {
            errors.push(`Missing ${envKey.toUpperCase()}_DB`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
    };
}
