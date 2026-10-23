/**
 * In-memory registry of in-flight queries, keyed by a client-supplied queryId.
 * Lets the cancel endpoint find the PostgreSQL backend PID running a given
 * query so it can issue pg_cancel_backend() over a separate connection.
 *
 * This is a process-local singleton. pgLite runs as a single Node process
 * (next start / standalone), so a module-level Map is sufficient; it is NOT
 * shared across multiple server instances.
 */

export interface RunningQuery {
    pid: number;
    environment: string;
    database?: string;
}

const runningQueries = new Map<string, RunningQuery>();

export function registerQuery(queryId: string, info: RunningQuery): void {
    runningQueries.set(queryId, info);
}

export function unregisterQuery(queryId: string): void {
    runningQueries.delete(queryId);
}

export function getRunningQuery(queryId: string): RunningQuery | undefined {
    return runningQueries.get(queryId);
}
