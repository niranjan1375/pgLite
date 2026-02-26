# Quick Wins Implementation Guide

This guide covers 5 easy-to-implement features that provide immediate value.

## 1. Execution Time Display ⏱️

**Effort**: 30 minutes  
**Files**: `app/api/query/route.ts`, `components/ResultsTable.tsx`

### Step 1: Modify API Route

```typescript
// app/api/query/route.ts
export async function POST(req: NextRequest) {
    try {
        const { query, database } = await req.json();

        // ... connection setup

        const startTime = performance.now();
        const result = await client.query(query);
        const executionTime = performance.now() - startTime;

        return NextResponse.json({
            rows: result.rows,
            rowCount: result.rowCount || 0,
            fields: result.fields.map((f) => f.name),
            executionTime: Math.round(executionTime), // Round to nearest ms
        });
    } catch (error) {
        // ... error handling
    }
}
```

### Step 2: Update TypeScript Interface

```typescript
// app/page.tsx (or shared types file)
interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: string[];
    executionTime?: number; // Optional for backward compatibility
}
```

### Step 3: Display in ResultsTable

```typescript
// components/ResultsTable.tsx
export default function ResultsTable({ result, error, loading }: ResultsTableProps) {
  // ... existing code

  return (
    <div className="flex-1 overflow-auto p-4">
      {result && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">
              {result.rowCount.toLocaleString()} rows returned
            </span>
            {result.executionTime !== undefined && (
              <>
                <span className="text-gray-600">•</span>
                <span className={`font-mono ${
                  result.executionTime < 100
                    ? 'text-green-400'
                    : result.executionTime < 1000
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}>
                  {result.executionTime}ms
                </span>
              </>
            )}
          </div>
          {/* ... export buttons */}
        </div>
      )}
      {/* ... rest of component */}
    </div>
  );
}
```

---

## 2. Row Count Badge 🏷️

**Effort**: 15 minutes  
**Files**: `components/ResultsTable.tsx`

### Already implemented above! Just style it better:

```typescript
<div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-800 border border-gray-700">
  <span className={`w-2 h-2 rounded-full ${
    result.rowCount === 0
      ? 'bg-gray-500'
      : result.rowCount < 100
      ? 'bg-green-500'
      : result.rowCount < 10000
      ? 'bg-yellow-500'
      : 'bg-red-500'
  }`} />
  <span className="text-sm font-semibold text-gray-300">
    {result.rowCount.toLocaleString()} rows
  </span>
</div>
```

---

## 3. SQL Formatter 🎨

**Effort**: 1 hour  
**Dependencies**: `sql-formatter`

### Step 1: Install Package

```bash
npm install sql-formatter
```

### Step 2: Add Format Button to QueryTabs

```typescript
// components/QueryTabs.tsx
import { format } from 'sql-formatter';

export default function QueryTabs({ ... }: QueryTabsProps) {
  // ... existing state

  const formatCurrentQuery = () => {
    if (!activeTab) return;

    try {
      const formatted = format(activeTab.query, {
        language: 'postgresql',
        tabWidth: 2,
        keywordCase: 'upper',
        linesBetweenQueries: 2,
      });

      updateTabQuery(activeTab.id, formatted);
    } catch (error) {
      console.error('Format error:', error);
      // Optionally show toast notification
    }
  };

  return (
    <div>
      {/* In the toolbar area */}
      <div className="flex items-center gap-2">
        <button
          onClick={formatCurrentQuery}
          disabled={!activeTab?.query.trim()}
          className="px-3 py-1.5 rounded text-sm bg-gray-800 hover:bg-gray-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
          title="Format SQL (Ctrl+Shift+F)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Format
        </button>
        {/* ... other buttons */}
      </div>
      {/* ... rest of component */}
    </div>
  );
}
```

### Step 3: Add Keyboard Shortcut

```typescript
// In SQLEditor.tsx handleEditorDidMount
editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
    () => {
        // Trigger format from parent
        // You'll need to pass a format callback as prop
    },
);
```

---

## 4. Connection Status Indicator 🟢🔴

**Effort**: 30 minutes  
**Files**: New API route + component

### Step 1: Create Health Check API

```typescript
// app/api/health/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
    try {
        const pool = new Pool({
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || "5432"),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            ssl: {
                rejectUnauthorized: false,
            },
        });

        const client = await pool.connect();
        const startTime = performance.now();

        await client.query("SELECT 1");

        const latency = Math.round(performance.now() - startTime);

        client.release();
        await pool.end();

        return NextResponse.json({
            status: "healthy",
            latency,
            timestamp: Date.now(),
        });
    } catch (error) {
        return NextResponse.json(
            {
                status: "unhealthy",
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            },
            { status: 503 },
        );
    }
}
```

### Step 2: Create Status Component

```typescript
// components/ConnectionStatus.tsx
"use client";

import { useState, useEffect } from "react";

interface HealthStatus {
  status: "healthy" | "unhealthy" | "checking";
  latency?: number;
  error?: string;
  lastCheck?: number;
}

export default function ConnectionStatus() {
  const [health, setHealth] = useState<HealthStatus>({
    status: "checking",
  });

  const checkHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();

      setHealth({
        status: res.ok ? "healthy" : "unhealthy",
        latency: data.latency,
        error: data.error,
        lastCheck: Date.now(),
      });
    } catch (error) {
      setHealth({
        status: "unhealthy",
        error: "Cannot reach server",
        lastCheck: Date.now(),
      });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (health.status) {
      case "healthy":
        return "bg-green-500";
      case "unhealthy":
        return "bg-red-500";
      case "checking":
        return "bg-yellow-500";
    }
  };

  const getTooltip = () => {
    if (health.status === "healthy") {
      return `Connected • ${health.latency}ms latency`;
    } else if (health.status === "unhealthy") {
      return `Disconnected: ${health.error}`;
    } else {
      return "Checking connection...";
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800
                 border border-gray-700 cursor-help"
      title={getTooltip()}
    >
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}
                       ${health.status === 'checking' ? 'animate-pulse' : ''}`}
      />
      <span className="text-xs text-gray-400">
        {health.status === "healthy" && health.latency !== undefined
          ? `${health.latency}ms`
          : health.status === "unhealthy"
          ? "Offline"
          : "Checking..."}
      </span>
    </div>
  );
}
```

### Step 3: Add to Header

```typescript
// app/page.tsx
import ConnectionStatus from "@/components/ConnectionStatus";

// In the header section:
<div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
  <h1 className="text-xl font-bold">pgLite</h1>
  <div className="flex items-center gap-3">
    <ConnectionStatus />
    {/* ... other header items */}
  </div>
</div>
```

---

## 5. Auto-save Query Tabs 💾

**Effort**: 1-2 hours  
**Files**: `components/QueryTabs.tsx`

### Step 1: Add localStorage Persistence

```typescript
// components/QueryTabs.tsx
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pgLite_queryTabs";
const AUTOSAVE_DELAY = 500; // Debounce delay in ms

export default function QueryTabs({ ... }: QueryTabsProps) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");

  // Load tabs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.tabs && parsed.tabs.length > 0) {
          setTabs(parsed.tabs);
          setActiveTabId(parsed.activeTabId || parsed.tabs[0].id);
          return;
        }
      } catch (e) {
        console.error("Failed to restore tabs:", e);
      }
    }

    // Default tab if no stored tabs
    const defaultTab = {
      id: Date.now().toString(),
      name: "Query 1",
      query: "",
    };
    setTabs([defaultTab]);
    setActiveTabId(defaultTab.id);
  }, []);

  // Debounced save to localStorage
  useEffect(() => {
    if (tabs.length === 0) return;

    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ tabs, activeTabId })
        );
      } catch (e) {
        console.error("Failed to save tabs:", e);
      }
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [tabs, activeTabId]);

  // Add a "Clear All" function for users
  const clearAllTabs = useCallback(() => {
    if (confirm("Clear all tabs and start fresh?")) {
      localStorage.removeItem(STORAGE_KEY);
      const freshTab = {
        id: Date.now().toString(),
        name: "Query 1",
        query: "",
      };
      setTabs([freshTab]);
      setActiveTabId(freshTab.id);
    }
  }, []);

  // ... rest of component
}
```

### Step 2: Add Settings Menu (Optional)

```typescript
// In QueryTabs toolbar:
<div className="relative group">
  <button className="px-2 py-1 rounded hover:bg-gray-800">
    ⚙️
  </button>
  <div className="absolute right-0 top-full mt-2 bg-gray-800 rounded-lg
                  border border-gray-700 shadow-xl opacity-0 invisible
                  group-hover:opacity-100 group-hover:visible
                  transition-all z-50 min-w-[200px]">
    <button
      onClick={clearAllTabs}
      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700
                 rounded-t-lg text-red-400"
    >
      Clear All Tabs
    </button>
    <button
      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700"
      onClick={() => {
        const exported = JSON.stringify({ tabs, activeTabId }, null, 2);
        navigator.clipboard.writeText(exported);
        alert("Tabs exported to clipboard!");
      }}
    >
      Export Tabs (JSON)
    </button>
  </div>
</div>
```

---

## Implementation Checklist

### Feature 1: Execution Time ✅

- [ ] Add timing to API route
- [ ] Update QueryResult interface
- [ ] Display in ResultsTable with color coding
- [ ] Test with fast queries (<100ms)
- [ ] Test with slow queries (>1s)

### Feature 2: Row Count Badge ✅

- [ ] Display row count
- [ ] Add color coding (green/yellow/red)
- [ ] Format with thousand separators
- [ ] Test with 0 rows
- [ ] Test with large counts (>1M)

### Feature 3: SQL Formatter ✅

- [ ] Install sql-formatter package
- [ ] Add format button to toolbar
- [ ] Implement format function
- [ ] Handle format errors gracefully
- [ ] Add keyboard shortcut
- [ ] Test with complex queries
- [ ] Test with invalid SQL

### Feature 4: Connection Status ✅

- [ ] Create /api/health endpoint
- [ ] Create ConnectionStatus component
- [ ] Add polling logic (30s interval)
- [ ] Display in header
- [ ] Show latency when connected
- [ ] Show error when disconnected
- [ ] Test with server offline
- [ ] Add manual refresh button

### Feature 5: Auto-save Tabs ✅

- [ ] Load tabs from localStorage on mount
- [ ] Save tabs on every change (debounced)
- [ ] Restore active tab
- [ ] Add clear all function
- [ ] Test restore after refresh
- [ ] Test with many tabs (>10)
- [ ] Handle localStorage quota exceeded
- [ ] Optional: Export/import tabs

---

## Combined Implementation Time

| Feature           | Effort         | Priority |
| ----------------- | -------------- | -------- |
| Execution Time    | 30 min         | High     |
| Row Count         | 15 min         | High     |
| SQL Formatter     | 1 hour         | Medium   |
| Connection Status | 30 min         | Medium   |
| Auto-save Tabs    | 1.5 hours      | High     |
| **Total**         | **3.25 hours** |          |

## Testing Strategy

1. **Unit Testing**: Test utility functions in isolation
2. **Integration Testing**: Test API routes with real database
3. **E2E Testing**: Test full user flows
4. **Performance Testing**: Measure impact on load time

## Common Issues & Solutions

### Issue: localStorage quota exceeded

**Solution**: Limit query length in history, compress data

### Issue: Formatting breaks SQL syntax

**Solution**: Wrap in try-catch, show error toast

### Issue: Health check too frequent

**Solution**: Increase interval, add exponential backoff

### Issue: Tabs don't restore after crash

**Solution**: Add version field to detect incompatible storage

## Next Steps After Quick Wins

Once these 5 are done, consider:

1. **Query History** - Most requested feature
2. **Table Data Viewer** - High utility
3. **Keyboard Shortcuts Panel** - Improves discoverability
4. **Search in Tree** - Essential for large databases
