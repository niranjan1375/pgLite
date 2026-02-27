# P1-003: No Query Cancellation

**Priority**: P1 (High)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 3 hours

---

## Problem

Once query starts, no way to stop it:

- User accidentally runs `SELECT * FROM huge_table`
- Query runs for 30s until timeout
- UI frozen, no cancel button
- Database resources locked

---

## Risk Assessment

- **UX**: Frustrating "locked" experience
- **Resources**: Wasted CPU/memory on unwanted queries
- **Availability**: Long query blocks connection from pool

---

## Solution

### Step 1: Track Active Queries

```typescript
// lib/queryManager.ts
interface ActiveQuery {
    id: string;
    pool: Pool;
    client: PoolClient;
    pid: number; // PostgreSQL process ID
    startTime: Date;
}

const activeQueries = new Map<string, ActiveQuery>();

export function registerQuery(id: string, query: ActiveQuery) {
    activeQueries.set(id, query);
}

export function unregisterQuery(id: string) {
    activeQueries.delete(id);
}

export async function cancelQuery(id: string) {
    const active = activeQueries.get(id);
    if (!active) return false;

    // PostgreSQL cancel via pg_cancel_backend
    try {
        await active.pool.query(`SELECT pg_cancel_backend(${active.pid})`);
        return true;
    } catch (err) {
        console.error("Cancel failed:", err);
        return false;
    }
}
```

### Step 2: Update Query API

```typescript
// app/api/query/route.ts
const queryId = crypto.randomUUID();
const client = await pool.connect();

try {
    const pidResult = await client.query("SELECT pg_backend_pid()");
    const pid = pidResult.rows[0].pg_backend_pid;

    registerQuery(queryId, {
        id: queryId,
        pool,
        client,
        pid,
        startTime: new Date(),
    });

    const result = await client.query(query);

    return NextResponse.json({
        queryId,
        rows: result.rows,
        rowCount: result.rows.length,
    });
} catch (err: any) {
    if (err.code === "57014") {
        // query_canceled
        return NextResponse.json(
            {
                error: "Query cancelled by user",
                cancelled: true,
            },
            { status: 499 },
        ); // Client Closed Request
    }
    throw err;
} finally {
    unregisterQuery(queryId);
    client.release();
}
```

### Step 3: Add Cancel API Endpoint

```typescript
// app/api/cancel/route.ts
export async function POST(request: Request) {
    const { queryId } = await request.json();
    const success = await cancelQuery(queryId);

    return NextResponse.json({ success });
}
```

### Step 4: Add Cancel Button UI

```tsx
// components/SQLEditor.tsx
const [isRunning, setIsRunning] = useState(false);
const [currentQueryId, setCurrentQueryId] = useState<string>();

async function runQuery() {
    setIsRunning(true);

    const response = await fetch("/api/query", {
        method: "POST",
        body: JSON.stringify({ query, environment, database }),
    });

    const data = await response.json();
    setCurrentQueryId(data.queryId);
    setIsRunning(false);
}

async function cancelQuery() {
    await fetch("/api/cancel", {
        method: "POST",
        body: JSON.stringify({ queryId: currentQueryId }),
    });
}

return (
    <>
        {isRunning ? (
            <button onClick={cancelQuery} className="bg-red-500">
                ⏹ Cancel Query
            </button>
        ) : (
            <button onClick={runQuery}>▶ Run Query</button>
        )}
    </>
);
```

---

## PostgreSQL Backend Approach

Alternative: Use `pg_cancel_backend`:

```sql
-- Find running queries
SELECT pid, query FROM pg_stat_activity WHERE state = 'active';

-- Cancel specific query
SELECT pg_cancel_backend(12345);

-- Forcefully terminate (last resort)
SELECT pg_terminate_backend(12345);
```

---

## Verification

- [ ] Cancel button appears during query execution
- [ ] Clicking cancel stops query within 1s
- [ ] Cancelled query returns 499 status
- [ ] UI shows "Query cancelled" message
- [ ] Test: `SELECT pg_sleep(60)` can be cancelled

---

## Notes

- `pg_cancel_backend` is graceful, `pg_terminate_backend` is forceful
- Requires connection to stay open during query (use streams)
- Future: WebSocket for real-time cancel signaling
