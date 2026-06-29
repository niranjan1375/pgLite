/**
 * Server-side file storage for Context (shared, env-scoped variables).
 *
 * Backed by `.pgconsole/contexts.json` on the deployment filesystem (mirrors
 * how `lib/templates.ts` stores templates). On a single Docker container this
 * is shared by everyone hitting the app; move to a DB table if pgLite ever
 * runs multiple replicas. See docs/features/04-context.md.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    CONTEXT_FILE_VERSION,
    type ContextFile,
    type ContextProfile,
    emptyContextFile,
} from "./variable-resolver";

const PGCONSOLE_DIR = path.join(process.cwd(), ".pgconsole");
const CONTEXTS_FILE = path.join(PGCONSOLE_DIR, "contexts.json");

const PROFILE_ID_REGEX = /^[A-Za-z0-9._-]+$/;
const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Thrown for user/shape errors so the API can map them to HTTP 400. */
export class ContextValidationError extends Error {}

export async function readContexts(): Promise<ContextFile> {
    try {
        const raw = await readFile(CONTEXTS_FILE, "utf8");
        return validateContextFile(JSON.parse(raw));
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
            return emptyContextFile();
        }
        throw error;
    }
}

export async function writeContexts(input: unknown): Promise<ContextFile> {
    const validated = validateContextFile(input);

    // Stamp updatedAt only on profiles that actually changed, preserving prior
    // timestamps so the field stays meaningful for per-profile auditing.
    const existingById = new Map(
        (await readContextsSafe()).profiles.map((p) => [p.id, p]),
    );
    const now = new Date().toISOString();

    const profiles: ContextProfile[] = validated.profiles.map((profile) => {
        const prev = existingById.get(profile.id);
        const unchanged =
            prev &&
            prev.name === profile.name &&
            JSON.stringify(prev.environments) ===
                JSON.stringify(profile.environments);
        return {
            ...profile,
            updatedAt: unchanged && prev?.updatedAt ? prev.updatedAt : now,
        };
    });

    const result: ContextFile = { version: CONTEXT_FILE_VERSION, profiles };

    await mkdir(PGCONSOLE_DIR, { recursive: true });
    await writeFile(
        CONTEXTS_FILE,
        JSON.stringify(result, null, 2) + "\n",
        "utf8",
    );
    return result;
}

async function readContextsSafe(): Promise<ContextFile> {
    try {
        return await readContexts();
    } catch {
        // A corrupt existing file shouldn't block a valid overwrite.
        return emptyContextFile();
    }
}

/**
 * Validate and normalize an untrusted contexts document. Unknown environment
 * ids are intentionally allowed (envs may be added/renamed; resolution simply
 * ignores ones that don't match the current registry — spec §10).
 */
export function validateContextFile(input: unknown): ContextFile {
    if (!input || typeof input !== "object") {
        throw new ContextValidationError(
            "Invalid contexts payload: expected an object.",
        );
    }

    const profilesRaw = (input as Record<string, unknown>).profiles;
    if (!Array.isArray(profilesRaw)) {
        throw new ContextValidationError(
            "Invalid contexts payload: 'profiles' must be an array.",
        );
    }

    const seenIds = new Set<string>();
    const profiles: ContextProfile[] = profilesRaw.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new ContextValidationError(
                `Profile at index ${index} must be an object.`,
            );
        }
        const profile = entry as Record<string, unknown>;

        const id = profile.id;
        if (typeof id !== "string" || !PROFILE_ID_REGEX.test(id)) {
            throw new ContextValidationError(
                `Profile at index ${index} has an invalid id (letters, numbers, dot, underscore, hyphen).`,
            );
        }
        if (seenIds.has(id)) {
            throw new ContextValidationError(`Duplicate profile id '${id}'.`);
        }
        seenIds.add(id);

        const name = profile.name;
        if (typeof name !== "string" || name.trim().length === 0) {
            throw new ContextValidationError(
                `Profile '${id}' must have a non-empty name.`,
            );
        }

        const environmentsRaw = profile.environments ?? {};
        if (
            typeof environmentsRaw !== "object" ||
            Array.isArray(environmentsRaw)
        ) {
            throw new ContextValidationError(
                `Profile '${id}' environments must be an object.`,
            );
        }

        const environments: Record<string, Record<string, string>> = {};
        for (const [envId, valuesRaw] of Object.entries(
            environmentsRaw as Record<string, unknown>,
        )) {
            if (
                !valuesRaw ||
                typeof valuesRaw !== "object" ||
                Array.isArray(valuesRaw)
            ) {
                throw new ContextValidationError(
                    `Profile '${id}' environment '${envId}' must map variable names to string values.`,
                );
            }
            const values: Record<string, string> = {};
            for (const [varName, value] of Object.entries(
                valuesRaw as Record<string, unknown>,
            )) {
                if (!VARIABLE_NAME_REGEX.test(varName)) {
                    throw new ContextValidationError(
                        `Invalid variable name '${varName}' in profile '${id}'.`,
                    );
                }
                if (typeof value !== "string") {
                    throw new ContextValidationError(
                        `Variable '${varName}' in profile '${id}' must be a string.`,
                    );
                }
                values[varName] = value;
            }
            environments[envId] = values;
        }

        const updatedAt =
            typeof profile.updatedAt === "string"
                ? profile.updatedAt
                : undefined;

        return { id, name: name.trim(), updatedAt, environments };
    });

    return { version: CONTEXT_FILE_VERSION, profiles };
}
