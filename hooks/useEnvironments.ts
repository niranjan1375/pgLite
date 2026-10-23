import { useCallback, useEffect, useMemo, useState } from "react";

interface EnvironmentSummary {
    id: string;
    name: string;
    requiresVPN: boolean;
    production: boolean;
}

/** Environment list from `/api/environments`, fetched once on mount. */
export function useEnvironments() {
    const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
    const [defaultEnvironment, setDefaultEnvironment] = useState("dev");

    useEffect(() => {
        const fetchEnvironments = async () => {
            try {
                const res = await fetch("/api/environments", {
                    cache: "no-store",
                });
                const data = await res.json();
                const envs: EnvironmentSummary[] = Array.isArray(
                    data.environments,
                )
                    ? data.environments
                    : [];
                if (envs.length === 0) return;

                setEnvironments(envs);
                if (typeof data.defaultEnvironment === "string") {
                    setDefaultEnvironment(data.defaultEnvironment);
                }
            } catch (err) {
                console.error("Failed to fetch environments:", err);
            }
        };

        fetchEnvironments();
    }, []);

    const environmentIds = useMemo(
        () => environments.map((env) => env.id),
        [environments],
    );
    const environmentNamesById = useMemo(
        () => Object.fromEntries(environments.map((env) => [env.id, env.name])),
        [environments],
    );

    // Production-like envs (server-decided, see lib/environments.ts) get a
    // write confirmation. Unknown envs are treated as production.
    const isProdEnvironment = useCallback(
        (environment: string): boolean =>
            environments.find((env) => env.id === environment)?.production ??
            true,
        [environments],
    );

    return {
        environmentIds,
        environmentNamesById,
        defaultEnvironment,
        isProdEnvironment,
    };
}
