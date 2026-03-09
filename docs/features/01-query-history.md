# Query History Implementation Guide

## Overview

Add a persistent query history panel that stores the last 50-100 queries with metadata, allowing users to search, filter, and re-run previous queries.

## User Stories

- As a user, I want to see my recent queries so I can re-run them
- As a user, I want to search my query history to find a specific query
- As a user, I want to see which database each query was run against
- As a user, I want to see execution time and row count for each query

## UI Design

### Layout

```
┌─────────────────────────────────────────┐
│  [Toggle History] 🕐 Query History      │
│  ┌─────────────────────────────────┐    │
│  │ 🔍 Search history...            │    │
│  └─────────────────────────────────┘    │
│                                          │
│  Today                                   │
│  ┌─────────────────────────────────┐    │
│  │ SELECT * FROM users              │    │
│  │ postgres • 2:34 PM • 1.2k rows   │    │
│  │ 234ms                            │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ DELETE FROM sessions...          │    │
│  │ postgres • 2:31 PM • 45 rows     │    │
│  │ 123ms                            │    │
│  └─────────────────────────────────┘    │
│                                          │
│  Yesterday                               │
│  ┌─────────────────────────────────┐    │
│  │ UPDATE users SET...              │    │
│  │ appdb • Feb 25 • 1 row           │    │
│  │ 89ms                             │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Interactions

- Click item → Populate current query tab
- Hover → Show full query in tooltip
- Right-click → Context menu (Copy, Delete, Save as snippet)
- Cmd+H → Toggle history panel

## Data Structure

### TypeScript Interfaces

```typescript
interface QueryHistoryItem {
    id: string; // UUID or timestamp-based ID
    query: string; // The SQL query executed
    database: string; // Database name
    timestamp: number; // Unix timestamp
    executionTime?: number; // Milliseconds
    rowCount?: number; // Rows returned/affected
    success: boolean; // Whether query succeeded
    error?: string; // Error message if failed
}

interface QueryHistoryState {
    items: QueryHistoryItem[];
    maxItems: number; // Default: 100
    searchQuery: string;
    isOpen: boolean;
}
```

### localStorage Schema

```json
{
    "queryHistory": [
        {
            "id": "1709123456789",
            "query": "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days'",
            "database": "postgres",
            "timestamp": 1709123456789,
            "executionTime": 234,
            "rowCount": 1234,
            "success": true
        },
        {
            "id": "1709123123456",
            "query": "DELETE FROM sessions WHERE expires_at < NOW()",
            "database": "postgres",
            "timestamp": 1709123123456,
            "executionTime": 123,
            "rowCount": 45,
            "success": true
        }
    ]
}
```

## Implementation Steps

### Step 1: Create QueryHistory Component

**File**: `components/QueryHistory.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { format, formatDistance } from "date-fns";

interface QueryHistoryItem {
  id: string;
  query: string;
  database: string;
  timestamp: number;
  executionTime?: number;
  rowCount?: number;
  success: boolean;
  error?: string;
}

interface QueryHistoryProps {
  onSelectQuery: (query: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function QueryHistory({
  onSelectQuery,
  isOpen,
  onToggle,
}: QueryHistoryProps) {
  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("queryHistory");
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse query history:", e);
      }
    }
  }, []);

  // Filter items based on search
  const filteredItems = items.filter(
    (item) =>
      item.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.database.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by date
  const groupedItems = groupByDate(filteredItems);

  const handleItemClick = (item: QueryHistoryItem) => {
    onSelectQuery(item.query);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    localStorage.setItem("queryHistory", JSON.stringify(updated));
  };

  const handleClearAll = () => {
    if (confirm("Clear all query history?")) {
      setItems([]);
      localStorage.removeItem("queryHistory");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-100">
            Query History
          </h2>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                     rounded-lg text-sm text-gray-100 placeholder-gray-500
                     focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* History Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(groupedItems).length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-sm">No queries in history</p>
            <p className="text-xs mt-1">
              Execute a query to see it here
            </p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([date, items]) => (
            <div key={date} className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase px-2 mb-2">
                {date}
              </h3>
              {items.map((item) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleClearAll}
            className="w-full text-sm text-red-400 hover:text-red-300
                       py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Clear All History
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryItem({
  item,
  onClick,
  onDelete,
}: {
  item: QueryHistoryItem;
  onClick: () => void;
  onDelete: () => void;
}) {
  const truncateQuery = (query: string, maxLength = 60) => {
    const cleaned = query.replace(/\s+/g, " ").trim();
    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + "..."
      : cleaned;
  };

  return (
    <div
      className="group p-3 rounded-lg hover:bg-gray-800 cursor-pointer
                 transition-colors mb-1 relative"
      onClick={onClick}
      title={item.query}
    >
      {/* Query Preview */}
      <div className="font-mono text-xs text-gray-300 mb-1">
        {truncateQuery(item.query)}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>{item.database}</span>
        <span>•</span>
        <span>{format(item.timestamp, "h:mm a")}</span>
        {item.rowCount !== undefined && (
          <>
            <span>•</span>
            <span>{item.rowCount.toLocaleString()} rows</span>
          </>
        )}
        {item.executionTime !== undefined && (
          <>
            <span>•</span>
            <span>{Math.round(item.executionTime)}ms</span>
          </>
        )}
      </div>

      {/* Status indicator */}
      <div
        className={`absolute top-3 right-3 w-2 h-2 rounded-full ${
          item.success ? "bg-green-500" : "bg-red-500"
        }`}
      />

      {/* Delete button (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-8 opacity-0 group-hover:opacity-100
                   text-gray-500 hover:text-red-400 transition-opacity"
        title="Delete from history"
      >
        🗑️
      </button>
    </div>
  );
}

function groupByDate(items: QueryHistoryItem[]): Record<string, QueryHistoryItem[]> {
  const groups: Record<string, QueryHistoryItem[]> = {};
  const now = Date.now();
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;

  items.forEach((item) => {
    let label;
    const itemDate = new Date(item.timestamp).setHours(0, 0, 0, 0);

    if (itemDate === today) {
      label = "Today";
    } else if (itemDate === yesterday) {
      label = "Yesterday";
    } else {
      label = format(item.timestamp, "MMM d, yyyy");
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(item);
  });

  return groups;
}
```

### Step 2: Add History Storage Logic

**File**: `lib/queryHistory.ts`

```typescript
interface QueryHistoryItem {
    id: string;
    query: string;
    database: string;
    timestamp: number;
    executionTime?: number;
    rowCount?: number;
    success: boolean;
    error?: string;
}

const MAX_HISTORY_ITEMS = 100;
const STORAGE_KEY = "queryHistory";

export function addToHistory(item: Omit<QueryHistoryItem, "id" | "timestamp">) {
    const history = getHistory();

    const newItem: QueryHistoryItem = {
        ...item,
        id: Date.now().toString(),
        timestamp: Date.now(),
    };

    // Add to beginning of array
    history.unshift(newItem);

    // Keep only last MAX_HISTORY_ITEMS
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS);

    saveHistory(trimmed);
    return newItem;
}

export function getHistory(): QueryHistoryItem[] {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Failed to load query history:", e);
        return [];
    }
}

export function saveHistory(items: QueryHistoryItem[]) {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error("Failed to save query history:", e);
    }
}

export function clearHistory() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}

export function deleteHistoryItem(id: string) {
    const history = getHistory();
    const filtered = history.filter((item) => item.id !== id);
    saveHistory(filtered);
}
```

### Step 3: Integrate with Main Page

**File**: `app/page.tsx`

Add state and handler:

```typescript
import QueryHistory from "@/components/QueryHistory";
import { addToHistory } from "@/lib/queryHistory";

// Add state
const [historyOpen, setHistoryOpen] = useState(false);

// Modify runQuery to save to history
const runQuery = useCallback(async (query: string) => {
  const database = selectedDatabaseRef.current;

  if (!database) {
    setError("Please select a database first");
    return;
  }

  setLoading(true);
  setError(null);
  const startTime = performance.now();

  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, database }),
    });

    const executionTime = performance.now() - startTime;
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Query failed");

      // Save failed query to history
      addToHistory({
        query,
        database,
        success: false,
        error: data.error,
        executionTime,
      });
    } else {
      setResult(data);

      // Save successful query to history
      addToHistory({
        query,
        database,
        success: true,
        rowCount: data.rowCount,
        executionTime,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An error occurred";
    setError(errorMessage);

    addToHistory({
      query,
      database,
      success: false,
      error: errorMessage,
    });
  } finally {
    setLoading(false);
  }
}, []);

// Add keyboard shortcut for toggling
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault();
      setHistoryOpen(prev => !prev);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

// Update JSX layout
return (
  <div className="flex h-screen bg-gray-950 text-gray-100">
    {/* Database Tree */}
    <DatabaseTree ... />

    {/* Main Content */}
    <div className="flex-1 flex flex-col">
      {/* Header with history toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 className="text-xl font-bold">pgLite</h1>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700
                     text-sm transition-colors"
        >
          🕐 History
        </button>
      </div>

      {/* Query Tabs */}
      <QueryTabs ... />

      {/* Results */}
      <ResultsTable ... />
    </div>

    {/* Query History Panel */}
    <QueryHistory
      isOpen={historyOpen}
      onToggle={() => setHistoryOpen(!historyOpen)}
      onSelectQuery={(query) => {
        // Update current tab with selected query
        // You'll need to expose a method from QueryTabs to update current tab
      }}
    />
  </div>
);
```

### Step 4: Add date-fns for Date Formatting

```bash
npm install date-fns
```

## Testing Checklist

- [ ] History persists across page refreshes
- [ ] Search filters queries correctly
- [ ] Click item populates current query tab
- [ ] Delete removes item from history
- [ ] Clear all removes all items
- [ ] Failed queries show red indicator
- [ ] Successful queries show green indicator
- [ ] Execution time displays correctly
- [ ] Row count displays correctly
- [ ] Groups by date (Today, Yesterday, specific dates)
- [ ] Limits to 100 items maximum
- [ ] Cmd+H toggles history panel

## Future Enhancements

- Export history as JSON/CSV
- Star/favorite important queries
- Add tags to queries
- Filter by database
- Filter by date range
- Show query diff when hovering
- Auto-hide panel on small screens
- Sync history across devices (cloud backend)
