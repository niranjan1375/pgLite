// Client-side SQL text builders: identifier quoting, literals, and the
// primary-key DELETE the table viewer offers.

export function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

export function formatSqlLiteral(value: unknown): string {
    if (value === null || typeof value === "undefined") {
        return "NULL";
    }

    if (typeof value === "string") {
        return `'${value.replace(/'/g, "''")}'`;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "NULL";
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
    }

    if (value instanceof Date) {
        return `'${value.toISOString().replace(/'/g, "''")}'`;
    }

    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

/** `schema.name`, with `public` left implicit. */
export function displayTableName(table: { schema: string; name: string }) {
    return table.schema === "public"
        ? table.name
        : `${table.schema}.${table.name}`;
}

/**
 * DELETE for exactly one row, matched by its primary key. Returns an error
 * instead when a key column is empty, so a predicate can never match the
 * wrong row.
 */
export function buildDeleteRowQuery(
    table: { schema: string; name: string },
    primaryKeys: string[],
    row: Record<string, unknown>,
): { query: string } | { error: string } {
    if (primaryKeys.length === 0) {
        return { error: "Can't delete this row: the table has no primary key." };
    }

    const missingKey = primaryKeys.find((columnName) => row[columnName] == null);
    if (missingKey) {
        return {
            error: `Can't delete this row: primary key column "${missingKey}" is empty.`,
        };
    }

    const where = primaryKeys
        .map(
            (columnName) =>
                `${quoteIdentifier(columnName)} = ${formatSqlLiteral(row[columnName])}`,
        )
        .join(" AND ");

    const fullTableName =
        table.schema === "public"
            ? quoteIdentifier(table.name)
            : `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;

    return { query: `DELETE FROM ${fullTableName} WHERE ${where};` };
}

/** History entry text: the resolved @vars block followed by the SQL. */
export function buildHistoryQuery(
    query: string,
    variables?: Record<string, string>,
): string {
    if (!variables || Object.keys(variables).length === 0) {
        return query;
    }

    const variableBlock = Object.entries(variables)
        .map(([name, value]) => `@${name} = ${value}`)
        .join("\n");

    return `${variableBlock}\n\n${query}`;
}
