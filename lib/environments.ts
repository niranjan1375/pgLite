import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Environment {
    id?: string;
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    requiresVPN?: boolean;
}

export interface EnvironmentSummary {
    id: string;
    name: string;
    requiresVPN: boolean;
}

interface EnvironmentConfigInput {
    id: string;
    name: string;
    host: string;
    port?: number;
    user: string;
    password?: string;
    database: string;
    requiresVPN?: boolean;
}

interface CredentialsFileShape {
    environments?:
        | EnvironmentConfigInput[]
        | Record<string, Omit<EnvironmentConfigInput, "id">>;
}

const DEFAULT_CREDENTIALS_FILE = path.join(
    process.cwd(),
    ".pgconsole",
    "credentials.json",
);

function getLegacyEnvironments(): Record<string, Environment> {
    return {
        loadtest: {
            id: "loadtest",
            name: "Loadtest Azure",
            host: process.env.LOADTEST_HOST || "",
            port: parseInt(process.env.LOADTEST_PORT || "5432", 10),
            user: process.env.LOADTEST_USER || "",
            password: process.env.LOADTEST_PASSWORD || "",
            database: process.env.LOADTEST_DB || "",
            requiresVPN: false,
        },
        sandbox: {
            id: "sandbox",
            name: "Sandbox",
            host: process.env.SANDBOX_HOST || "",
            port: parseInt(process.env.SANDBOX_PORT || "5432", 10),
            user: process.env.SANDBOX_USER || "",
            password: process.env.SANDBOX_PASSWORD || "",
            database: process.env.SANDBOX_DB || "",
            requiresVPN: false,
        },
        staging: {
            id: "staging",
            name: "Staging",
            host: process.env.STAGING_HOST || "",
            port: parseInt(process.env.STAGING_PORT || "5432", 10),
            user: process.env.STAGING_USER || "",
            password: process.env.STAGING_PASSWORD || "",
            database: process.env.STAGING_DB || "",
            requiresVPN: false,
        },
        "vegapay-uat-snapshot": {
            id: "vegapay-uat-snapshot",
            name: "VegaPay UAT Snapshot",
            host: process.env.VEGAPAY_UAT_SNAPSHOT_HOST || "",
            port: parseInt(process.env.VEGAPAY_UAT_SNAPSHOT_PORT || "5432", 10),
            user: process.env.VEGAPAY_UAT_SNAPSHOT_USER || "",
            password: process.env.VEGAPAY_UAT_SNAPSHOT_PASSWORD || "",
            database: process.env.VEGAPAY_UAT_SNAPSHOT_DB || "",
            requiresVPN: true,
        },
        "vegapay-uat": {
            id: "vegapay-uat",
            name: "VegaPay UAT",
            host: process.env.VEGAPAY_UAT_HOST || "",
            port: parseInt(process.env.VEGAPAY_UAT_PORT || "5432", 10),
            user: process.env.VEGAPAY_UAT_USER || "",
            password: process.env.VEGAPAY_UAT_PASSWORD || "",
            database: process.env.VEGAPAY_UAT_DB || "",
            requiresVPN: true,
        },
        "unity-uat": {
            id: "unity-uat",
            name: "Unity UAT",
            host: process.env.UNITY_UAT_HOST || "",
            port: parseInt(process.env.UNITY_UAT_PORT || "5432", 10),
            user: process.env.UNITY_UAT_USER || "",
            password: process.env.UNITY_UAT_PASSWORD || "",
            database: process.env.UNITY_UAT_DB || "",
            requiresVPN: true,
        },
        dev: {
            id: "dev",
            name: "Development (Local)",
            host: process.env.DEV_HOST || "localhost",
            port: parseInt(process.env.DEV_PORT || "5432", 10),
            user: process.env.DEV_USER || "postgres",
            password: process.env.DEV_PASSWORD || "",
            database: process.env.DEV_DB || "postgres",
            requiresVPN: false,
        },
    };
}

function parseDynamicEnvironments(): Record<string, Environment> | null {
    const raw = process.env.PGLITE_ENVIRONMENTS_JSON;
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as
            | EnvironmentConfigInput[]
            | Record<string, Omit<EnvironmentConfigInput, "id">>;

        const entries: Array<[string, EnvironmentConfigInput]> = Array.isArray(
            parsed,
        )
            ? parsed.map((item) => [item.id, item])
            : Object.entries(parsed).map(([id, value]) => [
                  id,
                  { ...value, id },
              ]);

        const output: Record<string, Environment> = {};

        for (const [id, item] of entries) {
            if (!id || !item?.host || !item?.user || !item?.database) {
                continue;
            }

            output[id] = {
                id,
                name: item.name || id,
                host: item.host,
                port: item.port ?? 5432,
                user: item.user,
                password: item.password || "",
                database: item.database,
                requiresVPN: Boolean(item.requiresVPN),
            };
        }

        return Object.keys(output).length > 0 ? output : null;
    } catch (error) {
        console.error(
            "Failed to parse PGLITE_ENVIRONMENTS_JSON; falling back to legacy env mapping.",
            error,
        );
        return null;
    }
}

function parseFromEntries(
    entries: Array<[string, EnvironmentConfigInput]>,
): Record<string, Environment> {
    const output: Record<string, Environment> = {};

    for (const [id, item] of entries) {
        if (!id || !item?.host || !item?.user || !item?.database) {
            continue;
        }

        output[id] = {
            id,
            name: item.name || id,
            host: item.host,
            port: item.port ?? 5432,
            user: item.user,
            password: item.password || "",
            database: item.database,
            requiresVPN: Boolean(item.requiresVPN),
        };
    }

    return output;
}

function parseCredentialsFile(): Record<string, Environment> | null {
    const configuredPath = process.env.PGLITE_CREDENTIALS_FILE;
    const filePath = configuredPath || DEFAULT_CREDENTIALS_FILE;

    if (!existsSync(filePath)) {
        return null;
    }

    try {
        const raw = readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw) as
            | CredentialsFileShape
            | EnvironmentConfigInput[]
            | Record<string, Omit<EnvironmentConfigInput, "id">>;

        const environmentsNode =
            "environments" in (parsed as CredentialsFileShape)
                ? (parsed as CredentialsFileShape).environments
                : parsed;

        if (!environmentsNode) {
            return null;
        }

        const entries: Array<[string, EnvironmentConfigInput]> = Array.isArray(
            environmentsNode,
        )
            ? environmentsNode.map((item) => [item.id, item])
            : Object.entries(environmentsNode).map(([id, value]) => [
                  id,
                  { ...value, id },
              ]);

        const output = parseFromEntries(entries);
        return Object.keys(output).length > 0 ? output : null;
    } catch (error) {
        console.error("Failed to parse credentials file:", filePath, error);
        return null;
    }
}

export const environments: Record<string, Environment> =
    parseCredentialsFile() ||
    parseDynamicEnvironments() ||
    getLegacyEnvironments();

export function getEnvironment(env: string): Environment | null {
    return environments[env] || null;
}

export function getAllEnvironments(): string[] {
    return Object.keys(environments);
}

export function getDefaultEnvironment(): string {
    return getAllEnvironments()[0] || "dev";
}

export function getEnvironmentSummaries(): EnvironmentSummary[] {
    return Object.entries(environments).map(([id, env]) => ({
        id,
        name: env.name || id,
        requiresVPN: Boolean(env.requiresVPN),
    }));
}

export function getEnvironmentName(envId: string): string {
    return environments[envId]?.name || envId;
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
