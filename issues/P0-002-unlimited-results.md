# P0-002: Unlimited Query Result Size

**Priority**: P0 (Critical)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 2 hours

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

## Verification

- [ ] Query exceeding 10K rows returns 413 error
- [ ] Error message explains limit and suggests LIMIT clause
- [ ] UI shows row count: "Showing 10,000 of 1,234,567 rows"
- [ ] Performance test: `SELECT * FROM pg_class` completes without crash

---

## Notes

- P2-001 (cursor streaming) is long-term proper fix
- This is short-term safety guard
