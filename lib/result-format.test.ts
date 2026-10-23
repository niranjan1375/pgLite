import { describe, expect, it } from "vitest";
import { compareValues, toCsvField } from "./result-format";

describe("compareValues", () => {
    it("sorts numeric strings as numbers", () => {
        const sorted = ["10", "9", "-3", "100"].sort((a, b) =>
            compareValues(a, b, true),
        );
        expect(sorted).toEqual(["-3", "9", "10", "100"]);
    });

    it("is exact for bigints beyond 2^53", () => {
        expect(
            compareValues("9007199254740993", "9007199254740992", true),
        ).toBe(1);
    });

    it("handles decimals", () => {
        expect(compareValues("12.50", "12.5", true)).toBe(0);
        expect(compareValues("2.5", "10.25", true)).toBeLessThan(0);
    });

    it("compares text lexicographically when not numeric", () => {
        expect(compareValues("b", "a", false)).toBe(1);
        expect(compareValues("10", "9", false)).toBe(-1);
    });
});

describe("toCsvField", () => {
    it("writes NULL as an empty field", () => {
        expect(toCsvField(null)).toBe("");
    });

    it("quotes commas, quotes and line breaks", () => {
        expect(toCsvField("a,b")).toBe('"a,b"');
        expect(toCsvField('say "hi"')).toBe('"say ""hi"""');
        expect(toCsvField("line1\nline2")).toBe('"line1\nline2"');
    });

    it("writes objects as JSON", () => {
        expect(toCsvField({ a: 1 })).toBe('"{""a"":1}"');
        expect(toCsvField([1, 2])).toBe('"[1,2]"');
    });

    it("leaves plain values alone", () => {
        expect(toCsvField(42)).toBe("42");
        expect(toCsvField("plain")).toBe("plain");
    });
});
