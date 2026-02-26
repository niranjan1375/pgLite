# Code Snippets & Patterns

Quick reference for common patterns used in pgLite development.

## Table of Contents

1. [Component Templates](#component-templates)
2. [API Routes](#api-routes)
3. [State Management](#state-management)
4. [localStorage Patterns](#localstorage-patterns)
5. [Database Queries](#database-queries)
6. [UI Components](#ui-components)
7. [Error Handling](#error-handling)

---

## Component Templates

### Basic Component

```typescript
"use client";

import { useState } from "react";

interface MyComponentProps {
  data: string;
  onAction: (value: string) => void;
}

export default function MyComponent({ data, onAction }: MyComponentProps) {
  const [state, setState] = useState("");

  return (
    <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
      <h2 className="text-lg font-semibold mb-3">{data}</h2>
      <button
        onClick={() => onAction(state)}
        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500
                   transition-colors"
      >
        Submit
      </button>
    </div>
  );
}
```

### Modal Component

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg border border-gray-800
                      max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300">
            ✕
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
```

---

## API Routes

### Query Execution

```typescript
// app/api/query/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export async function POST(req: NextRequest) {
    try {
        const { query, database } = await req.json();

        if (!query || !database) {
            return NextResponse.json(
                { error: "Query and database are required" },
                { status: 400 },
            );
        }

        const pool = new Pool({
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || "5432"),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database,
            ssl: { rejectUnauthorized: false },
        });

        const client = await pool.connect();

        try {
            const startTime = performance.now();
            const result = await client.query(query);
            const executionTime = Math.round(performance.now() - startTime);

            return NextResponse.json({
                rows: result.rows,
                rowCount: result.rowCount || 0,
                fields: result.fields.map((f) => f.name),
                executionTime,
            });
        } finally {
            client.release();
            await pool.end();
        }
    } catch (error) {
        console.error("Query error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Query failed" },
            { status: 500 },
        );
    }
}
```

### GET Request

```typescript
// app/api/databases/route.ts
export async function GET(req: NextRequest) {
    try {
        const pool = new Pool({
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || "5432"),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: "postgres",
            ssl: { rejectUnauthorized: false },
        });

        const client = await pool.connect();

        try {
            const result = await client.query(
                "SELECT datname FROM pg_database WHERE datistemplate = false",
            );

            return NextResponse.json({
                databases: result.rows.map((row) => row.datname),
            });
        } finally {
            client.release();
            await pool.end();
        }
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : "Failed to fetch",
            },
            { status: 500 },
        );
    }
}
```

---

## State Management

### useState with TypeScript

```typescript
interface User {
    id: number;
    name: string;
}

const [user, setUser] = useState<User | null>(null);
const [users, setUsers] = useState<User[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### useRef to Avoid Stale Closures

```typescript
const [selectedDb, setSelectedDb] = useState("");
const selectedDbRef = useRef("");

// Sync ref with state
useEffect(() => {
    selectedDbRef.current = selectedDb;
}, [selectedDb]);

// Use ref in async functions
const runQuery = useCallback(async () => {
    const db = selectedDbRef.current; // Always current value
    // ... use db
}, []); // No dependencies needed
```

### useCallback for Performance

```typescript
const handleClick = useCallback((id: string) => {
    setData((prevData) => ({
        ...prevData,
        [id]: newValue,
    }));
}, []); // Stable function reference
```

### useEffect Patterns

```typescript
// Run once on mount
useEffect(() => {
    fetchData();
}, []);

// Run when dependency changes
useEffect(() => {
    if (selectedDb) {
        loadTables(selectedDb);
    }
}, [selectedDb]);

// Cleanup on unmount
useEffect(() => {
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
}, []);
```

---

## localStorage Patterns

### Save and Load

```typescript
const STORAGE_KEY = "pgLite_data";

// Save
const saveData = (data: DataType) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Storage failed:", e);
    }
};

// Load
const loadData = (): DataType | null => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error("Load failed:", e);
        return null;
    }
};

// Clear
const clearData = () => {
    localStorage.removeItem(STORAGE_KEY);
};
```

### Auto-save with Debouncing

```typescript
const [data, setData] = useState<DataType>(initialData);

useEffect(() => {
    const timeoutId = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, 500); // Save 500ms after last change

    return () => clearTimeout(timeoutId);
}, [data]);
```

### Load on Mount

```typescript
useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            setData(parsed);
        } catch (e) {
            console.error("Parse error:", e);
            // Optionally clear corrupted data
            localStorage.removeItem(STORAGE_KEY);
        }
    }
}, []); // Empty array = run once
```

---

## Database Queries

### Get All Databases

```sql
SELECT datname
FROM pg_database
WHERE datistemplate = false
ORDER BY datname;
```

### Get All Tables in Database

```sql
SELECT
  schemaname AS schema,
  tablename AS name
FROM pg_catalog.pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename;
```

### Get Table Columns

```sql
SELECT
  column_name AS name,
  data_type AS type,
  is_nullable AS nullable,
  column_default AS default_value
FROM information_schema.columns
WHERE table_name = $1
ORDER BY ordinal_position;
```

### Get Primary Keys

```sql
SELECT ku.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage ku
  ON tc.constraint_name = ku.constraint_name
WHERE tc.table_name = $1
  AND tc.constraint_type = 'PRIMARY KEY';
```

### Get Foreign Keys

```sql
SELECT
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = $1
  AND tc.constraint_type = 'FOREIGN KEY';
```

### Get Table Row Count

```sql
SELECT COUNT(*) as count FROM table_name;
```

### Get Table Size

```sql
SELECT pg_size_pretty(pg_total_relation_size('table_name')) as size;
```

### Get All Indexes

```sql
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = $1;
```

---

## UI Components

### Loading Spinner

```tsx
<div className="flex items-center justify-center h-32">
    <svg
        className="animate-spin w-5 h-5 text-blue-500"
        fill="none"
        viewBox="0 0 24 24"
    >
        <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
        />
        <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
    </svg>
</div>
```

### Empty State

```tsx
<div className="flex flex-col items-center justify-center h-64 text-gray-500">
    <svg className="w-16 h-16 mb-4" /* icon */ />
    <p className="text-lg font-medium">No data found</p>
    <p className="text-sm mt-1">Try executing a query</p>
</div>
```

### Error Banner

```tsx
{
    error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg mb-4">
            <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-400" /* icon */ />
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        </div>
    );
}
```

### Success Toast

```tsx
const [showToast, setShowToast] = useState(false);

// Trigger
const showSuccess = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
};

// Component
{
    showToast && (
        <div
            className="fixed bottom-4 right-4 px-4 py-3 bg-green-600 
                  rounded-lg shadow-lg text-white animate-slide-up"
        >
            ✓ Success!
        </div>
    );
}
```

### Button Variants

```tsx
// Primary
<button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                   text-white font-medium transition-colors">
  Primary Action
</button>

// Secondary
<button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700
                   text-gray-100 transition-colors">
  Secondary
</button>

// Danger
<button className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500
                   text-white transition-colors">
  Delete
</button>

// Ghost
<button className="px-4 py-2 rounded-lg hover:bg-gray-800
                   text-gray-400 hover:text-gray-300 transition-colors">
  Cancel
</button>

// Disabled
<button disabled className="px-4 py-2 rounded-lg bg-gray-800
                            text-gray-500 opacity-50 cursor-not-allowed">
  Disabled
</button>
```

### Input Field

```tsx
<div className="mb-4">
    <label className="block text-sm font-medium text-gray-300 mb-2">
        Label
    </label>
    <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter value..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 
               rounded-lg text-gray-100 placeholder-gray-500
               focus:outline-none focus:border-blue-500 transition-colors"
    />
</div>
```

### Dropdown Select

```tsx
<select
    value={selected}
    onChange={(e) => setSelected(e.target.value)}
    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
             text-gray-100 focus:outline-none focus:border-blue-500"
>
    <option value="">Select option...</option>
    {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
            {opt.label}
        </option>
    ))}
</select>
```

### Table

```tsx
<table className="w-full text-sm border-collapse">
    <thead className="bg-gray-800">
        <tr>
            <th className="px-4 py-3 text-left font-semibold">Column 1</th>
            <th className="px-4 py-3 text-left font-semibold">Column 2</th>
        </tr>
    </thead>
    <tbody>
        {data.map((row, idx) => (
            <tr
                key={idx}
                className="border-t border-gray-800 hover:bg-gray-800/50"
            >
                <td className="px-4 py-2">{row.col1}</td>
                <td className="px-4 py-2">{row.col2}</td>
            </tr>
        ))}
    </tbody>
</table>
```

---

## Error Handling

### Try-Catch Pattern

```typescript
const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
        const res = await fetch("/api/endpoint");

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Request failed");
        }

        const data = await res.json();
        setData(data);
    } catch (err) {
        console.error("Fetch failed:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
        setLoading(false);
    }
};
```

### Form Validation

```typescript
const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
        setError("Name is required");
        return;
    }

    if (name.length < 3) {
        setError("Name must be at least 3 characters");
        return;
    }

    // Clear error and proceed
    setError(null);
    submitData({ name });
};
```

### Confirmation Dialog

```typescript
const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this item?")) {
        return;
    }

    // Proceed with deletion
    deleteItem(id);
};
```

---

## Utility Functions

### Format Number with Commas

```typescript
const formatNumber = (num: number): string => {
    return num.toLocaleString();
};

// Usage: formatNumber(1234567) => "1,234,567"
```

### Truncate String

```typescript
const truncate = (str: string, maxLength: number): string => {
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
};
```

### Debounce Function

```typescript
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Usage
const debouncedSearch = debounce((query: string) => {
    performSearch(query);
}, 300);
```

### Copy to Clipboard

```typescript
const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error("Copy failed:", err);
        return false;
    }
};

// Usage with feedback
const handleCopy = async () => {
    const success = await copyToClipboard(data);
    if (success) {
        setToast("Copied!");
    } else {
        setError("Failed to copy");
    }
};
```

### Download File

```typescript
const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

// Usage
downloadFile(csvContent, "data.csv", "text/csv");
downloadFile(jsonContent, "data.json", "application/json");
```

---

## Keyboard Shortcuts

### Global Shortcuts

```typescript
useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd+K or Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            openCommandPalette();
        }

        // Escape
        if (e.key === "Escape") {
            closeModal();
        }

        // Cmd+S or Ctrl+S
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            saveData();
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```

### Monaco Editor Shortcuts

```typescript
// In handleEditorDidMount
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    executeQuery();
});

editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
    () => {
        formatQuery();
    },
);
```

---

## Performance Optimization

### React.memo

```typescript
const ExpensiveComponent = React.memo(function ExpensiveComponent({
  data
}: { data: DataType }) {
  // Component only re-renders if `data` changes
  return <div>{/* ... */}</div>;
});
```

### useMemo

```typescript
const sortedData = useMemo(() => {
    return data.sort((a, b) => a.value - b.value);
}, [data]); // Only re-sort when data changes
```

### Dynamic Imports

```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
  ssr: false, // Disable server-side rendering
});
```

---

## Date Formatting

```typescript
import { format, formatDistance } from "date-fns";

// Format date
format(new Date(), "MMM d, yyyy"); // "Feb 26, 2026"
format(new Date(), "h:mm a"); // "2:30 PM"

// Relative time
formatDistance(pastDate, new Date(), { addSuffix: true });
// "2 hours ago"
```

---

**Pro tip**: Bookmark this file for quick reference while implementing features!
