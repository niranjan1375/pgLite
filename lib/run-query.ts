import type { PoolClient, QueryConfig, QueryResult } from "pg";

/**
 * Execute user-written SQL on a pinned client.
 *
 * Read-only mode is enforced by Postgres, not by inspecting the SQL: the
 * statement runs inside BEGIN READ ONLY … ROLLBACK over the extended query
 * protocol, which accepts exactly one statement. A single statement can't
 * COMMIT its way out of the transaction, so no leading comment, writable CTE
 * or `; DROP …` can write.
 */
export async function runUserQuery(
    client: PoolClient,
    sql: string,
    options: { readOnly: boolean },
): Promise<QueryResult> {
    if (!options.readOnly) {
        const result: QueryResult | QueryResult[] = await client.query(sql);
        // Multi-statement input returns one result per statement; show the last.
        return Array.isArray(result) ? result[result.length - 1] : result;
    }

    await client.query("BEGIN READ ONLY");
    try {
        // queryMode is supported by pg >= 8.11 but missing from @types/pg.
        return await client.query({
            text: sql,
            queryMode: "extended",
        } as QueryConfig);
    } finally {
        await client.query("ROLLBACK").catch(() => {});
    }
}

/**
 * Map Postgres errors caused by read-only enforcement to a friendly 403
 * message. Returns null for any other error.
 */
export function describeReadOnlyError(error: unknown): string | null {
    const pgError = error as { code?: string; message?: string };
    if (pgError?.code === "25006") {
        return "Blocked by read-only mode: this statement writes. Turn off read-only for this tab to run it.";
    }
    if (
        pgError?.code === "42601" &&
        /multiple commands/i.test(pgError.message ?? "")
    ) {
        return "Read-only mode runs one statement at a time. Put the cursor on a single statement (or select it) and run again.";
    }
    return null;
}

/**
 * Return a client that ran user SQL to the shared pool with a clean session:
 * roll back anything left open (a bare BEGIN), then DISCARD ALL to drop SET /
 * SET ROLE, temp tables and prepared statements. If that fails the
 * connection is destroyed rather than reused.
 */
export async function releaseAfterUserQuery(client: PoolClient): Promise<void> {
    try {
        await client.query("ROLLBACK");
        await client.query("DISCARD ALL");
        client.release();
    } catch (error) {
        client.release(error instanceof Error ? error : true);
    }
}
