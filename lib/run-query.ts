import type { PoolClient, QueryConfig, QueryResult } from "pg";
import Cursor from "pg-cursor";
import { typeParsers } from "./db";
import { scanStatements } from "./sql-safety";

export interface UserQueryResult extends QueryResult {
    /** More than `maxRows` rows existed; `rows` holds only the first `maxRows`. */
    truncated: boolean;
}

/** Row-returning statements that are read through a cursor. */
const STREAMED_KEYWORDS = new Set(["SELECT", "WITH", "VALUES", "TABLE"]);

function isStreamable(sql: string): boolean {
    const statements = scanStatements(sql);
    if (statements.length !== 1) {
        return false;
    }
    const keyword = /^[A-Za-z_]+/.exec(statements[0].code)?.[0].toUpperCase();
    return keyword !== undefined && STREAMED_KEYWORDS.has(keyword);
}

/**
 * Fetch at most `maxRows + 1` rows through a cursor, so an unbounded SELECT
 * never pulls the whole table into memory (or over the network) only to be
 * cut down to `maxRows` afterwards.
 */
async function readCapped(
    client: PoolClient,
    sql: string,
    maxRows: number,
): Promise<UserQueryResult> {
    // The cursor ignores the pool's type parsers unless given them explicitly.
    const cursor = client.query(
        new Cursor(sql, undefined, { types: typeParsers }),
    );
    const { rows, result } = await new Promise<{
        rows: Record<string, unknown>[];
        result: QueryResult;
    }>((resolve, reject) => {
        cursor.read(maxRows + 1, (error, rows, result) =>
            error ? reject(error) : resolve({ rows, result }),
        );
    });
    // Only close after a successful read: on error the cursor has already
    // re-synced the connection, and a second close could wait forever.
    await cursor.close();

    const truncated = rows.length > maxRows;
    const kept = truncated ? rows.slice(0, maxRows) : rows;
    return {
        command: result.command ?? "SELECT",
        rowCount: kept.length,
        oid: 0,
        fields: result.fields,
        rows: kept,
        truncated,
    };
}

async function execute(
    client: PoolClient,
    sql: string,
    options: { singleStatement: boolean; maxRows: number },
): Promise<UserQueryResult> {
    if (isStreamable(sql)) {
        return readCapped(client, sql, options.maxRows);
    }

    const result: QueryResult | QueryResult[] = options.singleStatement
        ? // queryMode is supported by pg >= 8.11 but missing from @types/pg.
          await client.query({ text: sql, queryMode: "extended" } as QueryConfig)
        : await client.query(sql);
    // Multi-statement input returns one result per statement; show the last.
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    const truncated = last.rows.length > options.maxRows;
    return {
        ...last,
        rows: truncated ? last.rows.slice(0, options.maxRows) : last.rows,
        truncated,
    };
}

/**
 * Execute user-written SQL on a pinned client, returning at most `maxRows`
 * rows (single SELECT-like statements are streamed and stop early).
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
    options: { readOnly: boolean; maxRows: number },
): Promise<UserQueryResult> {
    if (!options.readOnly) {
        return execute(client, sql, {
            singleStatement: false,
            maxRows: options.maxRows,
        });
    }

    await client.query("BEGIN READ ONLY");
    try {
        return await execute(client, sql, {
            singleStatement: true,
            maxRows: options.maxRows,
        });
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
