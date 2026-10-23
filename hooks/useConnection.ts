import { useCallback, useEffect, useRef, useState } from "react";

const OFFLINE_RETRY_MS = 10_000;

interface ConnectionState {
    environment: string;
    connected: boolean;
    latency?: number;
}

async function ping(environment: string): Promise<ConnectionState> {
    try {
        const res = await fetch(
            `/api/ping?environment=${encodeURIComponent(environment)}`,
        );
        const data = await res.json();
        if (data.ok === true) {
            return {
                environment,
                connected: true,
                latency:
                    typeof data.latencyMs === "number" ? data.latencyMs : undefined,
            };
        }
    } catch {
        // Server unreachable: offline.
    }
    return { environment, connected: false };
}

/**
 * Connectivity for the active environment. Pinged on switch, retried every
 * 10s while offline, and kept honest by query results: a query that comes
 * back proves the connection, a failed one triggers a re-check.
 * `connected` is null until the first answer for this environment.
 */
export function useConnection(environment: string | undefined) {
    const [state, setState] = useState<ConnectionState | null>(null);
    const environmentRef = useRef(environment);
    useEffect(() => {
        environmentRef.current = environment;
    }, [environment]);

    const check = useCallback(() => {
        if (!environment) return;
        void ping(environment).then((next) => {
            // Ignore answers for an environment you've already switched away from.
            if (environmentRef.current === environment) setState(next);
        });
    }, [environment]);

    useEffect(check, [check]);

    const current = state?.environment === environment ? state : null;
    const connected = current ? current.connected : null;

    useEffect(() => {
        if (!environment || connected !== false) return;
        const id = window.setInterval(check, OFFLINE_RETRY_MS);
        return () => window.clearInterval(id);
    }, [environment, connected, check]);

    /** Report a finished query against the active environment. */
    const reportQuery = useCallback(
        (queryEnvironment: string, ok: boolean) => {
            if (queryEnvironment !== environmentRef.current) return;
            if (ok) {
                setState((prev) => ({
                    environment: queryEnvironment,
                    connected: true,
                    latency:
                        prev?.environment === queryEnvironment
                            ? prev.latency
                            : undefined,
                }));
            } else {
                check();
            }
        },
        [check],
    );

    return { connected, latency: current?.latency, reportQuery };
}
