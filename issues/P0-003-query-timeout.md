# P0-003: No Query Timeout

**Priority**: P0 (Critical)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 30 minutes

---

## Problem

Queries run indefinitely without timeout. A cartesian join or infinite loop can:

- Lock database connections for hours
- Block other users (connection pool exhaustion)
- Consume CPU/memory indefinitely

**Current Code**:

```typescript
const result = await pool.query(query); // ⚠️ No timeout
```

Example problem query:

```sql
SELECT * FROM users CROSS JOIN orders CROSS JOIN products;
-- 1000 * 10000 * 5000 = 50 billion rows, runs for hours
```

---

## Risk Assessment

- **Availability**: Connection pool starvation
- **Cost**: Database CPU wasted on runaway queries
- **UX**: "Locked" UI with no feedback

---

## Solution

### Step 1: Set Statement Timeout in Pool Config

```typescript
// lib/db.ts
export function createPool(env: Environment, database?: string) {
    return new Pool({
        host: env.host,
        user: env.user,
        password: env.password,
        database: database || env.defaultDatabase,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        statement_timeout: 30000, // ⭐ 30 second query timeout
    });
}
```

### Step 2: Add Per-Query Timeout Override

For specific long-running queries:

```typescript
await pool.query(`SET statement_timeout = '5min'`);
await pool.query(longRunningQuery);
```

### Step 3: UI Feedback

Show elapsed time during query execution:

```tsx
<div>
    Query running... {elapsedSeconds}s
    {elapsedSeconds > 25 && (
        <span className="text-yellow-500">(timeout at 30s)</span>
    )}
</div>
```

### Step 4: Handle Timeout Error

```typescript
try {
    const result = await pool.query(query);
} catch (error: any) {
    if (error.code === "57014") {
        // query_canceled
        return NextResponse.json(
            {
                error: "Query exceeded 30 second timeout. Optimize or add indexes.",
                timeout: true,
            },
            { status: 408 },
        ); // Request Timeout
    }
    throw error;
}
```

---

## Verification

- [ ] 30 second timeout configured in pool
- [ ] Query running >30s returns timeout error
- [ ] UI shows "Query timed out" message
- [ ] Test query: `SELECT pg_sleep(60)` returns timeout

---

## Notes

- 30s is reasonable default for web app
- Allow override for migrations/data loads
- Consider per-environment timeouts (prod: 10s, dev: 60s)
