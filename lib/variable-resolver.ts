/**
 * Context (shared, environment-scoped variables) — pure resolution logic.
 *
 * Client-safe: NO node/fs imports, so this module can be imported by both the
 * React UI and server routes. All file storage lives in `lib/contexts.ts`.
 *
 * See docs/features/04-context.md. "Context" is the UI label; in code we use
 * unambiguous names to avoid collision with React Context / execution contexts.
 */

export const CONTEXT_FILE_VERSION = 1;

/** A single environment's values: variable name -> value. */
export type ContextEnvironmentValues = Record<string, string>;

/** A switchable named set of environment-scoped values. */
export interface ContextProfile {
    id: string;
    name: string;
    /** ISO timestamp, set server-side on write (auditing). */
    updatedAt?: string;
    /** environmentId -> { variableName -> value } */
    environments: Record<string, ContextEnvironmentValues>;
}

/** The on-disk document shape (`.pgconsole/contexts.json`). */
export interface ContextFile {
    version: number;
    profiles: ContextProfile[];
}

const VARIABLE_USAGE_REGEX = /(?<!\w)@([A-Za-z_][A-Za-z0-9_]*)\b/g;

export function emptyContextFile(): ContextFile {
    return { version: CONTEXT_FILE_VERSION, profiles: [] };
}

/**
 * Pick the active profile, falling back to the first profile when the stored
 * active id is missing or no longer exists.
 */
export function findActiveProfile(
    profiles: ContextProfile[],
    activeProfileId: string | null | undefined,
): ContextProfile | undefined {
    if (!profiles || profiles.length === 0) return undefined;
    if (activeProfileId) {
        const match = profiles.find((p) => p.id === activeProfileId);
        if (match) return match;
    }
    return profiles[0];
}

/** Context values for a given environment from a profile (empty if none). */
export function resolveContextVariables(
    profile: ContextProfile | undefined,
    environment: string,
): Record<string, string> {
    if (!profile || !environment) return {};
    return { ...(profile.environments?.[environment] ?? {}) };
}

/** Variable names referenced via `@name` in a SQL string. */
export function getReferencedVariableNames(sql: string): string[] {
    const names = new Set<string>();
    for (const match of sql.matchAll(VARIABLE_USAGE_REGEX)) {
        names.add(match[1]);
    }
    return [...names];
}

/**
 * Merge Context values with locally-declared variables.
 * Local declarations always win (per spec §5).
 */
export function resolveVariables(params: {
    profile: ContextProfile | undefined;
    local: Record<string, string>;
    environment: string;
}): Record<string, string> {
    const contextVars = resolveContextVariables(params.profile, params.environment);
    return { ...contextVars, ...(params.local ?? {}) };
}

/**
 * From the effective (merged) pool, select exactly the variables a SQL string
 * references. Returns the picked subset plus any referenced names that have no
 * value available. Sending only referenced variables avoids the backend
 * rejecting unrelated Context entries that happen to be unset for this env.
 */
export function pickReferencedVariables(
    sql: string,
    pool: Record<string, string>,
): { picked: Record<string, string>; missing: string[] } {
    const referenced = getReferencedVariableNames(sql);
    const picked: Record<string, string> = {};
    const missing: string[] = [];
    for (const name of referenced) {
        if (Object.prototype.hasOwnProperty.call(pool, name)) {
            picked[name] = pool[name];
        } else {
            missing.push(name);
        }
    }
    return { picked, missing };
}
