/**
 * SQL scanning + classification shared by the API routes and the UI.
 *
 * Client-safe: NO node imports. These helpers drive UX (confirm dialogs,
 * statement-at-cursor, EXPLAIN gating). The read-only guarantee itself is
 * enforced by Postgres — see `runUserQuery` in lib/run-query.ts.
 */

export interface SqlStatement {
    /** Original source of the statement (comments included), trimmed. */
    text: string;
    /**
     * The statement with comments removed and literals blanked ('' / "" / $$),
     * trimmed. Safe to keyword-match without tripping on string contents.
     */
    code: string;
    /** Offset in the input of the first character of `text`. */
    start: number;
    /** Offset in the input just past the last character of `text`. */
    end: number;
}

const DOLLAR_TAG_REGEX = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
const WORD_CHAR_REGEX = /[A-Za-z0-9_$]/;

/**
 * Split SQL on top-level semicolons. Understands '…' ('' escapes), E'…'
 * (backslash escapes), "…", $tag$…$tag$, -- line comments and nested block
 * comments, so a `;` inside any of those never splits a statement.
 * Statements that are only whitespace/comments are dropped.
 */
export function scanStatements(sql: string): SqlStatement[] {
    const statements: SqlStatement[] = [];
    const length = sql.length;
    let segmentStart = 0;
    let code = "";
    let index = 0;

    const flush = (segmentEnd: number) => {
        const raw = sql.slice(segmentStart, segmentEnd);
        const leading = raw.length - raw.trimStart().length;
        const text = raw.trim();
        const strippedCode = code.trim();
        if (strippedCode) {
            const start = segmentStart + leading;
            statements.push({
                text,
                code: strippedCode,
                start,
                end: start + text.length,
            });
        }
        code = "";
    };

    while (index < length) {
        const char = sql[index];
        const next = sql[index + 1];

        if (char === "-" && next === "-") {
            const newline = sql.indexOf("\n", index);
            index = newline === -1 ? length : newline;
            code += " ";
            continue;
        }

        if (char === "/" && next === "*") {
            let depth = 1;
            index += 2;
            while (index < length && depth > 0) {
                if (sql[index] === "/" && sql[index + 1] === "*") {
                    depth++;
                    index += 2;
                } else if (sql[index] === "*" && sql[index + 1] === "/") {
                    depth--;
                    index += 2;
                } else {
                    index++;
                }
            }
            code += " ";
            continue;
        }

        if (char === "'") {
            const prev = sql[index - 1];
            const backslashEscapes =
                (prev === "E" || prev === "e") &&
                !WORD_CHAR_REGEX.test(sql[index - 2] ?? "");
            index++;
            while (index < length) {
                if (backslashEscapes && sql[index] === "\\") {
                    index += 2;
                    continue;
                }
                if (sql[index] === "'") {
                    if (sql[index + 1] === "'") {
                        index += 2;
                        continue;
                    }
                    index++;
                    break;
                }
                index++;
            }
            code += "''";
            continue;
        }

        if (char === '"') {
            index++;
            while (index < length) {
                if (sql[index] === '"') {
                    if (sql[index + 1] === '"') {
                        index += 2;
                        continue;
                    }
                    index++;
                    break;
                }
                index++;
            }
            code += '""';
            continue;
        }

        if (char === "$" && !WORD_CHAR_REGEX.test(sql[index - 1] ?? "")) {
            DOLLAR_TAG_REGEX.lastIndex = index;
            const match = DOLLAR_TAG_REGEX.exec(sql);
            if (match) {
                const tag = match[0];
                const closing = sql.indexOf(tag, index + tag.length);
                index = closing === -1 ? length : closing + tag.length;
                code += "$$";
                continue;
            }
        }

        if (char === ";") {
            flush(index);
            index++;
            segmentStart = index;
            continue;
        }

        code += char;
        index++;
    }

    flush(length);
    return statements;
}

/** Statements whose leading keyword always writes or changes state. */
const WRITE_LEADING_KEYWORDS = new Set([
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "DROP",
    "CREATE",
    "ALTER",
    "TRUNCATE",
    "GRANT",
    "REVOKE",
    "COPY",
    "VACUUM",
    "REINDEX",
    "CLUSTER",
    "COMMENT",
    "REFRESH",
    "CALL",
    "DO",
    "LOCK",
    "SECURITY",
    "IMPORT",
    "REASSIGN",
]);

/**
 * Data-modifying words inside an otherwise read-looking statement: writable
 * CTEs (WITH x AS (DELETE …)), SELECT … INTO, EXPLAIN ANALYZE UPDATE …
 */
const EMBEDDED_WRITE_REGEX = /\b(INSERT|UPDATE|DELETE|MERGE|INTO)\b/i;

function leadingKeyword(code: string): string {
    return /^[A-Za-z_]+/.exec(code)?.[0].toUpperCase() ?? "";
}

/**
 * Conservative "might this write?" check, used to decide when to ask for
 * confirmation. False positives (e.g. SELECT … FOR UPDATE) only cost a
 * dialog; it is never the thing that enforces read-only.
 */
export function isWriteQuery(sql: string): boolean {
    return scanStatements(sql).some((statement) => {
        const keyword = leadingKeyword(statement.code);
        if (WRITE_LEADING_KEYWORDS.has(keyword)) {
            return true;
        }
        return EMBEDDED_WRITE_REGEX.test(statement.code);
    });
}

/**
 * EXPLAIN ANALYZE actually executes the statement, so only allow a single
 * plain read.
 */
export function isExplainableReadQuery(sql: string): boolean {
    const statements = scanStatements(sql);
    if (statements.length !== 1) {
        return false;
    }
    const keyword = leadingKeyword(statements[0].code);
    return (
        ["SELECT", "WITH", "VALUES", "TABLE"].includes(keyword) &&
        !isWriteQuery(sql)
    );
}
