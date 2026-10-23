/**
 * Client-safe helpers for presenting query results.
 */

// Types that arrive as strings (to keep precision) but must sort as numbers.
export const NUMERIC_TYPES = new Set([
    "int2",
    "int4",
    "int8",
    "oid",
    "float4",
    "float8",
    "numeric",
]);
const INTEGER_STRING_REGEX = /^-?\d+$/;

function compareNumeric(a: unknown, b: unknown): number {
    const aText = String(a);
    const bText = String(b);
    // Exact for bigints beyond 2^53; Number() is fine for everything else.
    if (INTEGER_STRING_REGEX.test(aText) && INTEGER_STRING_REGEX.test(bText)) {
        const aBig = BigInt(aText);
        const bBig = BigInt(bText);
        return aBig < bBig ? -1 : aBig > bBig ? 1 : 0;
    }
    return Number(aText) - Number(bText);
}

/** Ascending comparison of two non-null cell values. */
export function compareValues(
    a: unknown,
    b: unknown,
    numeric: boolean,
): number {
    if (numeric) {
        return compareNumeric(a, b);
    }
    if (typeof a === "number" && typeof b === "number") {
        return a - b;
    }
    if (typeof a === "boolean" && typeof b === "boolean") {
        return Number(a) - Number(b);
    }
    const aText = typeof a === "object" ? JSON.stringify(a) : String(a);
    const bText = typeof b === "object" ? JSON.stringify(b) : String(b);
    return aText < bText ? -1 : aText > bText ? 1 : 0;
}

/**
 * One CSV field per RFC 4180: quoted when it contains a comma, quote or line
 * break. NULL is an empty field; JSON/array values are written as JSON.
 */
export function toCsvField(value: unknown): string {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
