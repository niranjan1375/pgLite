# P0-002: Unlimited Query Result Size

**Priority**: P0 (Critical)  
**Status**: ✅ Fixed  
**Created**: 2026-02-27  
**Resolved**: 2026-02-27  
**Effort**: 2 hours (Actual: 30 minutes)

---

## Problem

Query API (`app/api/query/route.ts`) has no row limit enforcement. Running `SELECT * FROM huge_table` loads millions of rows into memory, causing:

- Browser tab crash (V8 heap exhaustion)
- Server memory spike (Next.js route handler OOM)
- Network saturation (gigabytes of JSON transfer)
- Database load (full table scan)

**Current Code**:

```typescript
const result = await pool.query(query); // ⚠️ Unlimited rows
res.json({ rows: result.rows }); // ⚠️ All rows sent to client
```

---

## Risk Assessment

- **DoS Vector**: Malicious/accidental queries crash app
- **Cost**: Database CPU/IO wasted on unrestricted scans
- **UX**: 3651 rows already cause visible lag; 100K+ would crash

---

## Solution

### Step 1: Server-Side Row Limit

```typescript
// app/api/query/route.ts
const MAX_ROWS = 10000; // Hard limit

const result = await pool.query(query);

if (result.rows.length > MAX_ROWS) {
    return NextResponse.json(
        {
            error: `Query returned ${result.rows.length} rows (limit: ${MAX_ROWS}). Add LIMIT clause.`,
            truncated: true,
        },
        { status: 413 },
    ); // Payload Too Large
}

return NextResponse.json({
    rows: result.rows,
    rowCount: result.rows.length,
});
```

### Step 2: Add User-Facing Limit Input

```tsx
// components/SQLEditor.tsx
<input
    type="number"
    placeholder="Row limit (max 10000)"
    value={rowLimit}
    onChange={(e) => setRowLimit(e.target.value)}
/>
```

Auto-append `LIMIT` clause if not present:

```typescript
let finalQuery = query.trim();
if (!finalQuery.match(/LIMIT\s+\d+/i) && rowLimit) {
    finalQuery += ` LIMIT ${rowLimit}`;
}
```

### Step 3: Add Warning UI

When result is truncated:

```tsx
{
    data.truncated && (
        <div className="bg-yellow-500 text-black p-2">
            ⚠️ Results truncated at {MAX_ROWS} rows. Refine your query.
        </div>
    );
}
```

---

## Alternative: Cursor-Based Pagination

For better UX, fetch results in batches (see P2-001):

```sql
DECLARE cursor CURSOR FOR SELECT * FROM big_table;
FETCH 1000 FROM cursor;
```

---

## ✅ Resolution

### Changes Implemented

1. **Added MAX_ROWS constant (10,000) in query API:**
    - Server-side enforcement prevents unlimited result sets
    - Returns 413 (Payload Too Large) when limit exceeded

2. **Enhanced error response:**
    - Clear message: "Query returned X rows (limit: 10,000). Please add a LIMIT clause..."
    - Includes `truncated: true` flag and actual `rowCount`

3. **Added truncated flag to QueryResult interface:**
    - Allows UI to detect when results are limited
    - Type-safe handling in frontend

4. **Added visual warning banner:**
    - Yellow warning banner appears above results when truncated
    - Shows actual row count with helpful message
    - Suggests adding WHERE clause or LIMIT

### Files Modified

- `/app/api/query/route.ts` - Added MAX_ROWS limit and 413 response
- `/app/page.tsx` - Added truncated detection and warning UI

### Security Improvements

- ✅ DoS vector closed: Cannot load unlimited rows
- ✅ Memory protection: Server and browser protected from overflow
- ✅ Clear user feedback: Users understand why results are limited

---

## Verification

- [x] ~~Query exceeding 10K rows returns 413 error~~ → now truncates to 10K and returns rows (see Update 2026-06-26)
- [x] UI shows warning banner with first-N-of-total rows when truncated
- [x] `truncated` + `totalRows` flags properly propagated from API to UI
- [ ] Performance test: `SELECT * FROM generate_series(1, 100000)` returns first 10K with banner

---

## Notes

- P2-001 (cursor streaming) is long-term proper fix
- This is short-term safety guard

---

## Update (2026-06-26): reject → truncate-and-show

**Problem with the original fix:** returning a `413` error on `>10K` rows
showed the user *nothing* — they had to manually add a `LIMIT` and re-run
just to see any data. Worse, the rows were already fully materialized in
memory by the time the count check ran (`pool.query()` returns the whole
result set), so the 413 gave **no memory benefit** — it only discarded work
already done. The frontend's "RESULTS TRUNCATED" banner was effectively dead
code because the API never returned truncated rows.

**What changed:** both `app/api/query/route.ts` and
`app/api/workspace-query/route.ts` now **truncate to the first `MAX_ROWS`
and return them** with `truncated: true` plus a new `totalRows` field (the
full pre-truncation count), instead of erroring. The banner now reads:
`⚠ RESULTS TRUNCATED — SHOWING FIRST 10,000 OF 32,965 ROWS · ADD A LIMIT
CLAUSE TO REFINE`.

**Files modified:** `app/api/query/route.ts`,
`app/api/workspace-query/route.ts`, `app/page.tsx` (added `totalRows` to
`QueryResult`, updated banner). Commit `169e3cf` on `feat/v2-wip`.

**Still outstanding:** DB-side memory is *not* bounded — all rows are still
fetched before slicing. See P2-001 for the decision on the real fix.
