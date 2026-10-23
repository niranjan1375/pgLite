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

type SqlTokenKind = "code" | "literal" | "comment" | "semicolon";

interface SqlToken {
    kind: SqlTokenKind;
    text: string;
    start: number;
}

/**
 * Lex SQL into runs of plain code, literals ('…', E'…', "…", $tag$…$tag$),
 * comments (-- and nested block) and top-level semicolons. Concatenating
 * every token's text reproduces the input exactly.
 */
function tokenize(sql: string): SqlToken[] {
    const tokens: SqlToken[] = [];
    const length = sql.length;
    let codeStart = 0;
    let index = 0;

    const push = (kind: SqlTokenKind, start: number, end: number) => {
        if (codeStart < start) {
            tokens.push({
                kind: "code",
                text: sql.slice(codeStart, start),
                start: codeStart,
            });
        }
        tokens.push({ kind, text: sql.slice(start, end), start });
        codeStart = end;
        index = end;
    };

    while (index < length) {
        const char = sql[index];
        const next = sql[index + 1];
        const start = index;

        if (char === "-" && next === "-") {
            const newline = sql.indexOf("\n", index);
            push("comment", start, newline === -1 ? length : newline);
            continue;
        }

        if (char === "/" && next === "*") {
            let depth = 1;
            let cursor = index + 2;
            while (cursor < length && depth > 0) {
                if (sql[cursor] === "/" && sql[cursor + 1] === "*") {
                    depth++;
                    cursor += 2;
                } else if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
                    depth--;
                    cursor += 2;
                } else {
                    cursor++;
                }
            }
            push("comment", start, cursor);
            continue;
        }

        if (char === "'" || char === '"') {
            const backslashEscapes =
                char === "'" &&
                (sql[index - 1] === "E" || sql[index - 1] === "e") &&
                !WORD_CHAR_REGEX.test(sql[index - 2] ?? "");
            let cursor = index + 1;
            while (cursor < length) {
                if (backslashEscapes && sql[cursor] === "\\") {
                    cursor += 2;
                    continue;
                }
                if (sql[cursor] === char) {
                    if (sql[cursor + 1] === char) {
                        cursor += 2;
                        continue;
                    }
                    cursor++;
                    break;
                }
                cursor++;
            }
            push("literal", start, Math.min(cursor, length));
            continue;
        }

        if (char === "$" && !WORD_CHAR_REGEX.test(sql[index - 1] ?? "")) {
            DOLLAR_TAG_REGEX.lastIndex = index;
            const match = DOLLAR_TAG_REGEX.exec(sql);
            if (match) {
                const tag = match[0];
                const closing = sql.indexOf(tag, index + tag.length);
                push(
                    "literal",
                    start,
                    closing === -1 ? length : closing + tag.length,
                );
                continue;
            }
        }

        if (char === ";") {
            push("semicolon", start, start + 1);
            continue;
        }

        index++;
    }

    if (codeStart < length) {
        tokens.push({
            kind: "code",
            text: sql.slice(codeStart),
            start: codeStart,
        });
    }
    return tokens;
}

/** Placeholder kept in `SqlStatement.code` for a literal ('' / "" / $$). */
function literalPlaceholder(text: string): string {
    if (text.startsWith('"')) return '""';
    if (text.startsWith("$")) return "$$";
    return "''";
}

/**
 * Split SQL on top-level semicolons. Understands '…' ('' escapes), E'…'
 * (backslash escapes), "…", $tag$…$tag$, -- line comments and nested block
 * comments, so a `;` inside any of those never splits a statement.
 * Statements that are only whitespace/comments are dropped.
 */
export function scanStatements(sql: string): SqlStatement[] {
    const statements: SqlStatement[] = [];
    let segmentStart = 0;
    let code = "";

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

    for (const token of tokenize(sql)) {
        if (token.kind === "semicolon") {
            flush(token.start);
            segmentStart = token.start + 1;
        } else if (token.kind === "comment") {
            code += " ";
        } else if (token.kind === "literal") {
            code += literalPlaceholder(token.text);
        } else {
            code += token.text;
        }
    }

    flush(sql.length);
    return statements;
}

/**
 * Apply a regex replacement to the code parts of SQL only, leaving string
 * literals, quoted identifiers, dollar-quoted bodies and comments untouched.
 */
export function replaceInCode(
    sql: string,
    pattern: RegExp,
    replacement: string,
): string {
    return tokenize(sql)
        .map((token) =>
            token.kind === "code"
                ? token.text.replace(pattern, replacement)
                : token.text,
        )
        .join("");
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
