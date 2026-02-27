# P1-001: Pool-Per-Request Architecture

**Priority**: P1 (High)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 4 hours

---

## Problem

Current implementation creates a new connection pool for **every API request**:

```typescript
// app/api/query/route.ts
const pool = createPool(env, database); // ⚠️ New pool per request
const result = await pool.query(query);
await pool.end(); // ⚠️ Tears down entire pool
```

Under load:

- 10 concurrent queries = 50 connections created/destroyed (5 per pool × 10 pools)
- PostgreSQL `max_connections` exhausted
- Connection setup overhead (TCP + auth) on every request

---

## Risk Assessment

- **Scalability**: Fails at ~20 concurrent users
- **Performance**: 50-100ms connection overhead per query
- **Reliability**: "Too many connections" errors

---

## Solution

### Step 1: Global Pool Manager

```typescript
// lib/db.ts
const pools = new Map<string, Pool>();

export function getPool(env: Environment, database?: string): Pool {
    const key = `${env.id}:${database || env.defaultDatabase}`;

    if (!pools.has(key)) {
        const pool = new Pool({
            host: env.host,
            user: env.user,
            password: env.password,
            database: database || env.defaultDatabase,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            statement_timeout: 30000,
        });

        pool.on("error", (err) => {
            console.error(`Pool error [${key}]:`, err);
            pools.delete(key); // Remove dead pool
        });

        pools.set(key, pool);
    }

    return pools.get(key)!;
}

// Graceful shutdown
export async function closeAllPools() {
    for (const [key, pool] of pools) {
        await pool.end();
        pools.delete(key);
    }
}
```

### Step 2: Update All API Routes

```typescript
// app/api/query/route.ts
const pool = getPool(env, database); // ⭐ Reuses existing pool
const result = await pool.query(query);
// NO pool.end() - pool stays alive
```

### Step 3: Cleanup on Server Shutdown

```typescript
// app/layout.tsx or middleware
process.on("SIGTERM", async () => {
    await closeAllPools();
    process.exit(0);
});
```

---

## Performance Impact

| Metric           | Before       | After               | Improvement     |
| ---------------- | ------------ | ------------------- | --------------- |
| Connection setup | 50-100ms     | 0ms (reused)        | 50-100ms faster |
| Concurrent users | ~10          | ~100                | 10x capacity    |
| DB connections   | 5 × requests | 5 × (env+db combos) | 90% reduction   |

---

## Verification

- [ ] Single pool per env+db combination
- [ ] Pool persists across multiple requests
- [ ] No "too many connections" errors under load
- [ ] Test: 50 concurrent queries succeed
- [ ] `SELECT count(*) FROM pg_stat_activity` shows stable connection count

---

## Notes

- Max 7 environments × 10 databases = 70 pools × 5 connections = 350 max connections
- PostgreSQL default `max_connections = 100` → need to tune
- Consider per-environment pool size (prod: 10, staging: 3)
