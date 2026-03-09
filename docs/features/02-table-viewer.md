# Table Data Viewer Implementation Guide

## Overview

Click a table name in the database tree to instantly view its data without writing a SELECT query. Includes pagination, sorting, and filtering capabilities.

## User Stories

- As a user, I want to click a table to see its data immediately
- As a user, I want to paginate through large tables
- As a user, I want to sort columns by clicking headers
- As a user, I want to filter/search within table data
- As a user, I want to see table metadata (row count, columns)

## UI Design

### Interaction Flow

1. User clicks table name in tree → Loads first 100 rows
2. Pagination controls appear if table has >100 rows
3. Can sort by clicking column headers
4. Search box filters current page
5. "Load All" button for small tables

### Table Preview Panel

```
┌────────────────────────────────────────────────────────┐
│ 📊 users (1,234 rows)              🔃 Refresh  ⬇️ Export│
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🔍 Search in results...                            │ │
│ └────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌────┬──────────┬───────────────┬─────────────────────┐ │
│ │ id │ username │ email         │ created_at          │ │
│ ├────┼──────────┼───────────────┼─────────────────────┤ │
│ │ 1  │ john_doe │ john@ex.com   │ 2024-02-25 10:30:00 │ │
│ │ 2  │ jane_doe │ jane@ex.com   │ 2024-02-25 11:15:23 │ │
│ │ 3  │ bob      │ bob@ex.com    │ 2024-02-26 09:00:45 │ │
│ └────┴──────────┴───────────────┴─────────────────────┘ │
│                                                          │
│  ← Previous   Page 1 of 13   Next →                     │
│  Showing 1-100 of 1,234 rows                            │
└────────────────────────────────────────────────────────┘
```

## Data Structure

### TypeScript Interfaces

```typescript
interface TableData {
    tableName: string;
    rows: Record<string, unknown>[];
    totalRows: number;
    columns: ColumnInfo[];
    page: number;
    pageSize: number;
    totalPages: number;
}

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    defaultValue?: string;
}

interface TableViewerState {
    data: TableData | null;
    loading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    sortColumn: string | null;
    sortDirection: "asc" | "desc";
    searchQuery: string;
}
```

## Implementation Steps

### Step 1: Create API Route for Table Data

**File**: `app/api/table-data/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export async function POST(req: NextRequest) {
    try {
        const { database, table, page = 1, pageSize = 100 } = await req.json();

        if (!database || !table) {
            return NextResponse.json(
                { error: "Database and table are required" },
                { status: 400 },
            );
        }

        // Create connection to specified database
        const pool = new Pool({
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || "5432"),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database,
            ssl: {
                rejectUnauthorized: false,
            },
        });

        const client = await pool.connect();

        try {
            // Get total row count
            const countResult = await client.query(
                `SELECT COUNT(*) as count FROM ${table}`,
            );
            const totalRows = parseInt(countResult.rows[0].count);

            // Get column metadata
            const columnsResult = await client.query(
                `SELECT 
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = $1
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position`,
                [table.replace("public.", "")],
            );

            const columns = columnsResult.rows.map((col) => ({
                name: col.column_name,
                type: col.data_type,
                nullable: col.is_nullable === "YES",
                isPrimaryKey: col.is_primary_key,
                isForeignKey: col.is_foreign_key,
                defaultValue: col.column_default,
            }));

            // Get paginated data
            const offset = (page - 1) * pageSize;
            const dataResult = await client.query(
                `SELECT * FROM ${table} LIMIT $1 OFFSET $2`,
                [pageSize, offset],
            );

            const totalPages = Math.ceil(totalRows / pageSize);

            return NextResponse.json({
                tableName: table,
                rows: dataResult.rows,
                totalRows,
                columns,
                page,
                pageSize,
                totalPages,
            });
        } finally {
            client.release();
            await pool.end();
        }
    } catch (error) {
        console.error("Table data fetch error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
        );
    }
}
```

### Step 2: Create TableViewer Component

**File**: `components/TableViewer.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";

interface TableData {
  tableName: string;
  rows: Record<string, unknown>[];
  totalRows: number;
  columns: ColumnInfo[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: string;
}

interface TableViewerProps {
  database: string;
  table: string;
  onClose: () => void;
}

export default function TableViewer({
  database,
  table,
  onClose,
}: TableViewerProps) {
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadTableData();
  }, [database, table, page, pageSize]);

  const loadTableData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/table-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database, table, page, pageSize }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to load table data");
      }

      const tableData = await res.json();
      setData(tableData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnName);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    if (!data || data.rows.length === 0) return;

    const headers = data.columns.map(col => col.name).join(",");
    const rows = data.rows.map((row) =>
      data.columns
        .map((col) => {
          const value = row[col.name];
          if (value === null) return "NULL";
          const str = String(value);
          if (str.includes(",") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Client-side filtering
  const filteredRows = data?.rows.filter((row) => {
    if (!searchQuery) return true;
    return Object.values(row).some((value) =>
      String(value).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  // Client-side sorting
  const sortedRows = sortColumn
    ? [...filteredRows].sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        const comparison = valA > valB ? 1 : valA < valB ? -1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      })
    : filteredRows;

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={onClose}
          className="mt-2 px-3 py-1 bg-gray-800 rounded hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">
            📊 {table}
            {data && (
              <span className="ml-2 text-sm text-gray-400">
                ({data.totalRows.toLocaleString()} rows)
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Database: {database}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTableData}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700
                       text-sm transition-colors disabled:opacity-50"
          >
            🔃 Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!data || data.rows.length === 0}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700
                       text-sm transition-colors disabled:opacity-50"
          >
            ⬇️ Export CSV
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700
                       text-sm transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-800">
        <input
          type="text"
          placeholder="Search in results..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                     rounded-lg text-sm placeholder-gray-500
                     focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">Loading table data...</div>
          </div>
        ) : data ? (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-800 z-10">
              <tr>
                {data.columns.map((col) => (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-gray-700
                               border-b border-gray-700 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-300">
                        {col.name}
                      </span>
                      {col.isPrimaryKey && (
                        <span className="text-xs text-yellow-500" title="Primary Key">
                          🔑
                        </span>
                      )}
                      {col.isForeignKey && (
                        <span className="text-xs text-blue-500" title="Foreign Key">
                          🔗
                        </span>
                      )}
                      {sortColumn === col.name && (
                        <span className="text-blue-400">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 font-normal mt-0.5">
                      {col.type}
                      {!col.nullable && <span className="ml-1">NOT NULL</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.columns.length}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No matching rows
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-gray-800/50 border-b border-gray-800/50"
                  >
                    {data.columns.map((col) => (
                      <td key={col.name} className="px-4 py-2 text-gray-300">
                        {row[col.name] === null ? (
                          <span className="text-gray-600 italic">NULL</span>
                        ) : (
                          <span className="font-mono text-xs">
                            {String(row[col.name])}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-gray-800">
          <div className="text-sm text-gray-400">
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, data.totalRows)} of{" "}
            {data.totalRows.toLocaleString()} rows
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700
                         text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {data.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === data.totalPages}
              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700
                         text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
          >
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={500}>500 rows</option>
            <option value={1000}>1000 rows</option>
          </select>
        </div>
      )}
    </div>
  );
}
```

### Step 3: Integrate with DatabaseTree

**File**: `components/DatabaseTree.tsx`

Add click handler to table items:

```typescript
interface DatabaseTreeProps {
  // ... existing props
  onTableClick?: (database: string, table: string) => void;
}

// In the table rendering section:
<div
  onClick={() => onTableClick?.(selectedDatabase, table.name)}
  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800
             cursor-pointer rounded text-sm"
>
  <span>📄</span>
  <span>{table.name.replace("public.", "")}</span>
</div>
```

### Step 4: Update Main Page

**File**: `app/page.tsx`

```typescript
import TableViewer from "@/components/TableViewer";

// Add state
const [viewingTable, setViewingTable] = useState<{
  database: string;
  table: string;
} | null>(null);

// Add handler
const handleTableClick = (database: string, table: string) => {
  setViewingTable({ database, table });
};

// In JSX:
{viewingTable && (
  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="w-11/12 h-5/6">
      <TableViewer
        database={viewingTable.database}
        table={viewingTable.table}
        onClose={() => setViewingTable(null)}
      />
    </div>
  </div>
)}

// Pass to DatabaseTree:
<DatabaseTree
  onTableClick={handleTableClick}
  // ... other props
/>
```

## Testing Checklist

- [ ] Click table name shows data viewer
- [ ] Pagination works correctly
- [ ] Sort by column header (toggle asc/desc)
- [ ] Search filters results
- [ ] Refresh reloads data
- [ ] Export CSV downloads correctly
- [ ] Primary key indicator shows
- [ ] Foreign key indicator shows
- [ ] NULL values display correctly
- [ ] Column types display
- [ ] Page size selector works
- [ ] Close button closes viewer
- [ ] Works with large tables (>10k rows)
- [ ] Works with tables containing special characters

## Performance Considerations

- Only load visible rows (pagination)
- Use server-side sorting for large datasets
- Add virtual scrolling for very wide tables
- Cache table counts to avoid repeated COUNT(\*) queries
- Add loading skeletons for better UX

## Future Enhancements

- Server-side filtering
- Column visibility toggle
- Column reordering (drag & drop)
- Inline cell editing (UPDATE queries)
- Row selection with bulk operations (DELETE)
- Export formats: JSON, SQL INSERT statements
- Save filter/sort preferences per table
- Show related records (follow foreign keys)
- Visualize column statistics (min/max/avg)
