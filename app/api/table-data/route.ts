import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";
import { getDefaultEnvironment } from "@/lib/environments";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;
const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_$]*$/;

type SortDirection = "asc" | "desc";

function quoteIdentifier(identifier: string) {
    if (!IDENTIFIER_REGEX.test(identifier)) {
        throw new Error(`Invalid identifier: ${identifier}`);
    }

    return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizePageSize(pageSize: unknown) {
    const parsed = Number.parseInt(String(pageSize ?? DEFAULT_PAGE_SIZE), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PAGE_SIZE;
    }

    return Math.min(parsed, MAX_PAGE_SIZE);
}

function normalizePage(page: unknown) {
    const parsed = Number.parseInt(String(page ?? 1), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1;
    }

    return parsed;
}

function normalizeSortDirection(direction: unknown): SortDirection {
    return String(direction).toLowerCase() === "desc" ? "desc" : "asc";
}

export async function POST(req: NextRequest) {
    let pool = null;

    try {
        const body = await req.json();
        const environment: string =
            body?.environment || getDefaultEnvironment();
        const database: string = body?.database;
        const schema: string = body?.schema || "public";
        const table: string = body?.table;
        const requestedSortColumn: string | null =
            typeof body?.sortColumn === "string" && body.sortColumn.trim()
                ? body.sortColumn.trim()
                : null;
        const searchQuery =
            typeof body?.searchQuery === "string"
                ? body.searchQuery.trim()
                : "";
        const requestedPage = normalizePage(body?.page);
        const pageSize = normalizePageSize(body?.pageSize);
        const sortDirection = normalizeSortDirection(body?.sortDirection);

        if (!database || !table) {
            return NextResponse.json(
                { error: "Database, schema, and table are required." },
                { status: 400 },
            );
        }

        const quotedSchema = quoteIdentifier(schema);
        const quotedTable = quoteIdentifier(table);
        const qualifiedTableName = `${quotedSchema}.${quotedTable}`;

        pool = createPool(environment, database);
        await pool.query("SET statement_timeout = 30000");

        const columnsResult = await pool.query(
            `WITH primary_keys AS (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                    AND tc.table_name = ku.table_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
            )
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                EXISTS (
                    SELECT 1
                    FROM primary_keys pk
                    WHERE pk.column_name = c.column_name
                ) AS is_primary_key
            FROM information_schema.columns c
            WHERE c.table_schema = $1
                AND c.table_name = $2
            ORDER BY c.ordinal_position`,
            [schema, table],
        );

        if (columnsResult.rowCount === 0) {
            return NextResponse.json(
                { error: `Table ${schema}.${table} was not found.` },
                { status: 404 },
            );
        }

        const columns = columnsResult.rows.map((column) => ({
            name: column.column_name as string,
            type: column.data_type as string,
            nullable: column.is_nullable === "YES",
            isPrimaryKey: column.is_primary_key === true,
            defaultValue:
                typeof column.column_default === "string"
                    ? (column.column_default as string)
                    : undefined,
        }));

        const columnNames = columns.map((column) => column.name);
        const defaultSortColumn =
            columns.find((column) => column.isPrimaryKey)?.name ||
            columnNames[0] ||
            null;
        const sortColumn =
            requestedSortColumn && columnNames.includes(requestedSortColumn)
                ? requestedSortColumn
                : defaultSortColumn;

        const filterValues: unknown[] = [];
        let whereClause = "";
        if (searchQuery && columnNames.length > 0) {
            const searchClauses = columnNames.map((columnName) => {
                filterValues.push(`%${searchQuery}%`);
                return `CAST(${quoteIdentifier(columnName)} AS text) ILIKE $${filterValues.length}`;
            });
            whereClause = ` WHERE (${searchClauses.join(" OR ")})`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*)::bigint AS count FROM ${qualifiedTableName}${whereClause}`,
            filterValues,
        );
        const totalRows = Number.parseInt(
            countResult.rows[0]?.count ?? "0",
            10,
        );
        const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
        const page = totalRows === 0 ? 1 : Math.min(requestedPage, totalPages);
        const offset = (page - 1) * pageSize;

        const dataValues = [...filterValues, pageSize, offset];
        const limitParam = `$${dataValues.length - 1}`;
        const offsetParam = `$${dataValues.length}`;
        const orderClause = sortColumn
            ? ` ORDER BY ${quoteIdentifier(sortColumn)} ${sortDirection.toUpperCase()} NULLS LAST`
            : "";

        const dataResult = await pool.query(
            `SELECT * FROM ${qualifiedTableName}${whereClause}${orderClause} LIMIT ${limitParam} OFFSET ${offsetParam}`,
            dataValues,
        );

        return NextResponse.json({
            rows: dataResult.rows,
            rowCount: dataResult.rows.length,
            fields:
                dataResult.fields.length > 0
                    ? dataResult.fields.map((field) => field.name)
                    : columnNames,
            totalRows,
            page,
            pageSize,
            totalPages,
            sortColumn,
            sortDirection,
            searchQuery,
            columns,
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}
