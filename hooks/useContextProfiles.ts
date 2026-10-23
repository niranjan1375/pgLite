import { useCallback, useEffect, useState } from "react";
import { validateVariableValues } from "@/lib/workspace-utils";
import {
    findActiveProfile,
    pickReferencedVariables,
    resolveVariables,
    type ContextProfile,
} from "@/lib/variable-resolver";

const ACTIVE_CONTEXT_PROFILE_KEY = "pgLite_activeContextProfile";

/**
 * Context: shared, env-scoped variables (workspace mode). Definitions are
 * shared (server file); the active-profile choice is per-user (localStorage).
 */
export function useContextProfiles() {
    const [profiles, setProfiles] = useState<ContextProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(
        null,
    );

    useEffect(() => {
        const fetchContexts = async () => {
            try {
                const res = await fetch("/api/contexts", { cache: "no-store" });
                const data = await res.json();
                if (Array.isArray(data?.profiles)) {
                    setProfiles(data.profiles);
                }
            } catch (err) {
                console.error("Failed to fetch contexts:", err);
            }
        };

        try {
            const stored = localStorage.getItem(ACTIVE_CONTEXT_PROFILE_KEY);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount; reading storage during render breaks hydration
            if (stored) setActiveProfileId(stored);
        } catch {
            // localStorage unavailable — fall back to first profile at resolve time.
        }

        fetchContexts();
    }, []);

    const activeProfile = findActiveProfile(profiles, activeProfileId);

    const setActiveProfile = useCallback((id: string) => {
        setActiveProfileId(id);
        try {
            localStorage.setItem(ACTIVE_CONTEXT_PROFILE_KEY, id);
        } catch {
            // localStorage unavailable — selection stays in-memory for the session.
        }
    }, []);

    const saveProfiles = useCallback(async (next: ContextProfile[]) => {
        const res = await fetch("/api/contexts", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: 1, profiles: next }),
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.error || "Failed to save context.");
        }
        setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
    }, []);

    // Build the variables payload for a workspace run: merge the active
    // Context profile's values for the env with locally-declared @vars (local
    // wins), then keep only the variables the SQL actually references.
    const buildWorkspaceVariables = useCallback(
        (
            sql: string,
            localVariables: Record<string, string>,
            environment: string,
        ): Record<string, string> => {
            const effective = resolveVariables({
                profile: findActiveProfile(profiles, activeProfileId),
                local: localVariables,
                environment,
            });
            const { picked, missing } = pickReferencedVariables(sql, effective);
            if (missing.length > 0) {
                throw new Error(
                    `SQL references undefined variables: ${missing
                        .map((name) => `@${name}`)
                        .join(", ")}`,
                );
            }
            if (Object.keys(picked).length > 0) {
                validateVariableValues(picked);
            }
            return picked;
        },
        [profiles, activeProfileId],
    );

    return {
        profiles,
        activeProfileId,
        activeProfile,
        setActiveProfile,
        saveProfiles,
        buildWorkspaceVariables,
    };
}
