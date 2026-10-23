import { describe, expect, it } from "vitest";
import {
    buildDeleteRowQuery,
    buildHistoryQuery,
    displayTableName,
    formatSqlLiteral,
    quoteIdentifier,
} from "./sql-literal";

describe("quoteIdentifier", () => {
    it("doubles embedded quotes", () => {
        expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
    });
});

describe("formatSqlLiteral", () => {
    it("formats scalars", () => {
        expect(formatSqlLiteral(null)).toBe("NULL");
        expect(formatSqlLiteral(undefined)).toBe("NULL");
        expect(formatSqlLiteral("o'brien")).toBe("'o''brien'");
        expect(formatSqlLiteral(42)).toBe("42");
        expect(formatSqlLiteral(Number.NaN)).toBe("NULL");
        expect(formatSqlLiteral(BigInt(10))).toBe("10");
        expect(formatSqlLiteral(true)).toBe("TRUE");
    });

    it("formats dates and objects as quoted text", () => {
        expect(formatSqlLiteral(new Date("2026-01-02T03:04:05Z"))).toBe(
            "'2026-01-02T03:04:05.000Z'",
        );
        expect(formatSqlLiteral({ a: "it's" })).toBe(`'{"a":"it''s"}'`);
    });
});

describe("buildDeleteRowQuery", () => {
    it("deletes by every primary key column", () => {
        expect(
            buildDeleteRowQuery(
                { schema: "billing", name: "line_items" },
                ["bill_id", "seq"],
                { bill_id: "b'1", seq: 3, note: "x" },
            ),
        ).toEqual({
            query: `DELETE FROM "billing"."line_items" WHERE "bill_id" = 'b''1' AND "seq" = 3;`,
        });
    });

    it("leaves the public schema implicit", () => {
        expect(
            buildDeleteRowQuery({ schema: "public", name: "users" }, ["id"], {
                id: 7,
            }),
        ).toEqual({ query: `DELETE FROM "users" WHERE "id" = 7;` });
    });

    it("refuses when a key is empty or there is no key", () => {
        expect(
            buildDeleteRowQuery({ schema: "public", name: "t" }, ["id"], {
                id: null,
            }),
        ).toHaveProperty("error");
        expect(
            buildDeleteRowQuery({ schema: "public", name: "t" }, [], { id: 1 }),
        ).toHaveProperty("error");
    });
});

describe("displayTableName / buildHistoryQuery", () => {
    it("formats names and history text", () => {
        expect(displayTableName({ schema: "public", name: "t" })).toBe("t");
        expect(displayTableName({ schema: "s", name: "t" })).toBe("s.t");
        expect(buildHistoryQuery("SELECT 1")).toBe("SELECT 1");
        expect(buildHistoryQuery("SELECT @a", { a: "1" })).toBe(
            "@a = 1\n\nSELECT @a",
        );
    });
});
