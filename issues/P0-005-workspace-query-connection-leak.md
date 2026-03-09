# P0-005: Workspace Query Connection Leak

**Priority**: P0 (Critical)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 4-6 hours

---

## Problem

`app/api/workspace-query/route.ts` creates a pool per request and does not close it, causing leaked connections.

Current pattern:

- `const pool = createPool(environment, routedDatabase)`
- `const client = await pool.connect()`
- `client.release()` is called
- `pool.end()` is never called

---

## Risk Assessment

- **Availability**: DB connection exhaustion under normal usage.
- **Reliability**: Increased latency and eventual request failures.
- **Operations**: Requires service restarts to recover.

---

## Solution

1. Move to shared pool manager (recommended), or
2. If keeping per-request pools, ensure `await pool.end()` in a `finally` block.
3. Add monitoring for active connections and pool saturation.

---

## Verification

- [ ] Load test shows stable connection count over time.
- [ ] No monotonic growth in `pg_stat_activity` from app role.
- [ ] Workspace query route closes resources on success and error paths.
