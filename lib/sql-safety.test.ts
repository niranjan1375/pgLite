import { describe, expect, it } from "vitest";
import {
    isExplainableReadQuery,
    isWriteQuery,
    replaceInCode,
    scanStatements,
} from "./sql-safety";

describe("scanStatements", () => {
    it("splits on top-level semicolons only", () => {
        const sql = `SELECT ';' AS a, "x;y" AS b, E'it\\'s;' AS c FROM t; SELECT 2`;
        const codes = scanStatements(sql).map((s) => s.code);
        expect(codes).toEqual([
            `SELECT '' AS a, "" AS b, E'' AS c FROM t`,
            "SELECT 2",
        ]);
    });

    it("keeps dollar-quoted bodies whole", () => {
        const sql =
            "CREATE FUNCTION f() RETURNS int AS $fn$ BEGIN RETURN 1; END $fn$ LANGUAGE plpgsql; SELECT $$a;b$$";
        expect(scanStatements(sql)).toHaveLength(2);
    });

    it("does not treat $1 parameters or foo$bar identifiers as dollar quotes", () => {
        const statements = scanStatements("SELECT $1, foo$bar$ FROM t; SELECT 2");
        expect(statements).toHaveLength(2);
    });

    it("ignores semicolons in line and nested block comments", () => {
        const sql = "-- a; b\nSELECT 1 /* x; /* y; */ z; */ FROM t";
        const [statement] = scanStatements(sql);
        expect(scanStatements(sql)).toHaveLength(1);
        expect(statement.code).toBe("SELECT 1   FROM t");
    });

    it("drops comment-only statements but keeps leading comments in text", () => {
        const sql = "-- only a comment\n;\n-- get users\nSELECT 1;";
        const statements = scanStatements(sql);
        expect(statements).toHaveLength(1);
        expect(statements[0].text).toBe("-- get users\nSELECT 1");
    });

    it("reports offsets that slice back to the statement text", () => {
        const sql = "  SELECT 1;\n\n  -- c\n  SELECT 2  ";
        for (const statement of scanStatements(sql)) {
            expect(sql.slice(statement.start, statement.end)).toBe(
                statement.text,
            );
        }
    });
});

describe("isWriteQuery", () => {
    it.each([
        "INSERT INTO t VALUES (1)",
        "-- note\nDELETE FROM t",
        "/* hi */ update t set x = 1",
        "WITH d AS (DELETE FROM t RETURNING 1) SELECT 1",
        "SELECT * INTO new_t FROM t",
        "SELECT 1; DROP TABLE t",
        "COPY t FROM '/tmp/x'",
        "GRANT SELECT ON t TO bob",
    ])("flags %j", (sql) => {
        expect(isWriteQuery(sql)).toBe(true);
    });

    it.each([
        "SELECT * FROM t",
        "select count(*) from t where status = 'DELETE'",
        'SELECT "update" FROM t',
        "-- DROP TABLE t\nSELECT 1",
        "SHOW search_path",
    ])("does not flag %j", (sql) => {
        expect(isWriteQuery(sql)).toBe(false);
    });
});

describe("isExplainableReadQuery", () => {
    it("allows a single read, even with a leading comment", () => {
        expect(isExplainableReadQuery("-- c\nSELECT 1")).toBe(true);
        expect(isExplainableReadQuery("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    });

    it("rejects writes and multiple statements", () => {
        expect(isExplainableReadQuery("UPDATE t SET x = 1")).toBe(false);
        expect(
            isExplainableReadQuery("WITH d AS (DELETE FROM t RETURNING 1) SELECT 1"),
        ).toBe(false);
        expect(isExplainableReadQuery("SELECT 1; SELECT 2")).toBe(false);
    });
});

describe("replaceInCode", () => {
    it("rewrites code but not literals, quoted identifiers or comments", () => {
        const sql =
            "SELECT core.users.id, 'see core.users', \"core.x\" FROM core.users -- core.users\nWHERE note = $$core.users$$";
        expect(replaceInCode(sql, /\bcore\./gi, "")).toBe(
            "SELECT users.id, 'see core.users', \"core.x\" FROM users -- core.users\nWHERE note = $$core.users$$",
        );
    });

    it("round-trips input unchanged when nothing matches", () => {
        const sql = "SELECT E'a\\'b;', $x$ ; $x$ /* ; */ ; -- tail";
        expect(replaceInCode(sql, /nomatch/g, "")).toBe(sql);
    });
});
