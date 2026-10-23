import { describe, expect, it } from "vitest";
import { applyVariables, normalizeTemplateName, parseTemplate } from "./templates";

describe("parseTemplate", () => {
    it("splits the variable block from the SQL", () => {
        expect(parseTemplate("@id = 5\n@name = bob\nSELECT @id, @name")).toEqual({
            variables: { id: "5", name: "bob" },
            sql: "SELECT @id, @name",
        });
    });

    it("rejects variables after the SQL starts", () => {
        expect(() => parseTemplate("@a = 1\nSELECT 1\n@b = 2")).toThrow(
            /only allowed at the top/,
        );
    });

    it("rejects duplicates", () => {
        expect(() => parseTemplate("@a = 1\n@a = 2\nSELECT @a")).toThrow(
            /Duplicate/,
        );
    });
});

describe("applyVariables", () => {
    it("inserts numbers, NULL and booleans unquoted", () => {
        expect(
            applyVariables("SELECT @n, @x, @b", { n: "42", x: "null", b: "true" }),
        ).toBe("SELECT 42, NULL, TRUE");
    });

    it("quotes and escapes text", () => {
        expect(applyVariables("WHERE name = @name", { name: "O'Brien" })).toBe(
            "WHERE name = 'O''Brien'",
        );
    });

    it("keeps an already single-quoted literal as-is", () => {
        expect(applyVariables("WHERE m = @m", { m: "'9705695237'" })).toBe(
            "WHERE m = '9705695237'",
        );
    });

    it("does not touch emails or other word@word text", () => {
        expect(
            applyVariables("SELECT 'a@b.com', @id", { id: "1" }),
        ).toBe("SELECT 'a@b.com', 1");
    });

    it("rejects undefined variables", () => {
        expect(() => applyVariables("SELECT @missing", { other: "1" })).toThrow(
            /undefined variables: @missing/,
        );
    });
});

describe("normalizeTemplateName", () => {
    it("adds the .sql extension", () => {
        expect(normalizeTemplateName("daily_report")).toBe("daily_report.sql");
    });

    it.each(["../etc/passwd", "a/b", "a\\b", "bad name"])(
        "rejects %j",
        (name) => {
            expect(() => normalizeTemplateName(name)).toThrow();
        },
    );
});
