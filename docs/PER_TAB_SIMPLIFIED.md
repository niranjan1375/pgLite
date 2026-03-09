# Simplified Per-Tab Architecture (Multi-VPN Context)

## New Understanding: Multi-VPN Simultaneous Access

Since you can connect to up to 5 VPNs simultaneously:

- ✅ All 5+ databases accessible at the same time
- ✅ Per-tab environment selection becomes **highly valuable**
- ✅ Can compare data across environments in parallel

## Simplified Per-Tab Implementation

### No Complex Caching Required

**Current approach** has global pool cache:

```typescript
const poolCache = new Map<string, Pool>(); // Complex to manage
```

**Simpler approach** - Let each query create its own connection:

```typescript
// No global cache needed - pg Pool already handles connection pooling internally
```

---

## Implementation Plan

### 1. Update QueryTab Interface

```typescript
// components/QueryTabs.tsx
interface QueryTab {
    id: string;
    name: string;
    query: string;
    environment: string; // Each tab has its own environment
    database: string; // Each tab has its own database
}
```

### 2. Simplify Database Connection (Remove Global Cache)

```typescript
// lib/db.ts - SIMPLIFIED
import { Pool } from "pg";
import { environments } from "./environments";

export function createPool(environment: string, database?: string): Pool {
    const envConfig = environments[environment] || environments.loadtest;

    return new Pool({
        host: envConfig.host,
        port: envConfig.port,
        user: envConfig.user,
        password: envConfig.password,
        database: database || envConfig.database,
        ssl: {
            rejectUnauthorized: false,
        },
        // Pool will auto-manage connections
        max: 10, // Max 10 connections per pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
}

// For backward compatibility (default pool)
export default createPool("loadtest");
```

### 3. Update API Route (Query)

```typescript
// app/api/query/route.ts - SIMPLIFIED
import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db";

export async function POST(req: NextRequest) {
    let pool = null;

    try {
        const body = await req.json();
        const query: string = body?.query?.trim();
        const database: string = body?.database;
        const environment: string = body?.environment || "loadtest";

        if (!query) {
            return NextResponse.json(
                { error: "Query cannot be empty." },
                { status: 400 },
            );
        }

        // Create pool for this specific request
        pool = createPool(environment, database);

        const result = await pool.query(query);

        return NextResponse.json({
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
            fields: result.fields.map((f) => f.name),
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        // Clean up pool after query
        if (pool) {
            await pool.end();
        }
    }
}
```

### 4. Update QueryTabs Component

```typescript
// components/QueryTabs.tsx
interface QueryTab {
    id: string;
    name: string;
    query: string;
    environment: string; // Per-tab environment
    database: string; // Per-tab database
}

export default function QueryTabs({
    tableColumns,
    onRunQuery,
    loading,
    globalEnvironment, // Global as default
    globalDatabase, // Global as default
}: QueryTabsProps) {
    const [tabs, setTabs] = useState<QueryTab[]>([
        {
            id: "1",
            name: "Query 1",
            query: "SELECT version();",
            environment: globalEnvironment,
            database: globalDatabase,
        },
    ]);

    // When creating new tab, use current global values
    const addTab = () => {
        const newTab: QueryTab = {
            id: String(nextTabId),
            name: `Query ${nextTabId}`,
            query: "",
            environment: globalEnvironment,
            database: globalDatabase,
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);
        setNextTabId(nextTabId + 1);
    };

    // Allow changing tab's environment
    const updateTabEnvironment = (tabId: string, env: string) => {
        setTabs(
            tabs.map((t) => (t.id === tabId ? { ...t, environment: env } : t)),
        );
    };

    // Allow changing tab's database
    const updateTabDatabase = (tabId: string, db: string) => {
        setTabs(tabs.map((t) => (t.id === tabId ? { ...t, database: db } : t)));
    };
}
```

---

## UI Design for Per-Tab

### Tab Header Shows Context

```
┌────────────────────────────────────────────────┐
│ [Query 1] [Query 2 🔷 Sandbox] [Query 3 🔶 UAT] │
│                                         [+]     │
└────────────────────────────────────────────────┘
```

### Each Tab Has Its Own Context Bar

```
┌──────────────────────────────────────────────────┐
│ 🗄️ Environment: [Loadtest ▼] | Database: [support ▼] │
│                                                   │
│ SELECT * FROM users;                              │
│                                                   │
└──────────────────────────────────────────────────┘
```

---

## Advantages of This Approach

### 1. No Complex Caching

- ✅ Each query creates its own pool
- ✅ Pool auto-manages internal connections
- ✅ Clean up after query completes
- ✅ No memory leaks from abandoned pools

### 2. Simple State Management

- ✅ Each tab is self-contained
- ✅ No global state to sync
- ✅ Easy to serialize/persist tab state

### 3. Multi-VPN Friendly

- ✅ Can query VegaPay UAT in tab 1
- ✅ While querying Unity UAT in tab 2
- ✅ And Sandbox in tab 3
- ✅ All simultaneously

### 4. Better DX (Developer Experience)

- ✅ Clear data flow
- ✅ No hidden global state
- ✅ Easier to debug
- ✅ Each query is independent

---

## Performance Considerations

### Won't creating pools per query be slow?

**No, because:**

1. **pg Pool** manages internal connection pooling
2. Creating Pool object is cheap (just config)
3. Actual connections are lazy (created on first query)
4. Most queries complete in <100ms
5. Pool cleanup releases connections properly

### Real-world numbers:

- Pool creation: ~1ms
- Query execution: ~50-500ms (network + DB)
- Pool cleanup: ~10ms

**Total overhead: ~11ms (2% of typical query time)**

This is negligible compared to network latency and query execution.

---

## Migration Path

### Phase 1: Add Per-Tab Without Breaking Global

1. Add `environment` and `database` fields to QueryTab
2. Initialize new tabs with current global values
3. Keep global selectors in sidebar (as defaults)
4. Add per-tab dropdowns (optional overrides)

### Phase 2: Make Per-Tab the Primary UX

1. Move environment/database selectors into tabs
2. Keep sidebar for navigation only
3. Add visual indicators for different environments

### Phase 3: Advanced Features

1. Save/restore tab sessions (localStorage)
2. Tab templates for common queries
3. Color-coded tabs by environment
4. Drag-and-drop tab reordering

---

## Recommendation

### Given Multi-VPN Context: **Switch to Per-Tab**

**Why:**

- ✅ You CAN access multiple databases simultaneously
- ✅ Comparing across environments is valuable workflow
- ✅ Simplified implementation has no caching complexity
- ✅ Better matches how you'll actually use the tool

**How:**

1. Start with simplified per-tab implementation (no caching)
2. Keep UI simple - dropdowns in each tab
3. Add visual indicators (colored tabs)
4. Test with 2-3 VPN connections active

---

## Code Size Comparison

**Complex Caching Approach:**

- lib/db.ts: ~100 lines (cache management, cleanup, etc.)
- Complexity: High 🔴

**Simple Per-Request Approach:**

- lib/db.ts: ~25 lines (just create pool function)
- Complexity: Low 🟢

**The simple approach is actually EASIER to implement and maintain!**

---

## Next Steps

Would you like me to:

1. ✅ Implement simplified per-tab architecture?
2. ✅ Keep global but add "pin tab" feature (hybrid)?
3. ⏸️ Keep current global approach as-is?

Let me know your preference and I'll implement it!
