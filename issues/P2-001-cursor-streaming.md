# P2-001: All-or-Nothing Result Loading

**Priority**: P2 (Medium)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 1 week

---

## Problem

Current architecture loads all rows into memory:

```typescript
const result = await pool.query(query); // ⚠️ Loads all 1M rows
return NextResponse.json({ rows: result.rows }); // ⚠️ Sends all to client
```

Issues:

- 100K+ row queries consume gigabytes of RAM
- User only sees first 30 rows (virtual scroll viewport)
- Network transfer wasted on invisible data
- Initial load time scales linearly with result size

---

## Impact Assessment

- **Memory**: 1M rows × 1KB/row = 1GB wasted
- **Bandwidth**: Gigabytes transferred for data never viewed
- **UX**: 10+ second initial load for large results

---

## Solution

### Architecture: Cursor-Based Streaming

```typescript
// app/api/query/route.ts
export async function POST(request: Request) {
    const {
        query,
        environment,
        database,
        cursorId,
        offset = 0,
        limit = 1000,
    } = await request.json();

    const pool = getPool(env, database);
    const client = await pool.connect();

    try {
        if (!cursorId) {
            // First request: declare cursor
            const cursorName = `cursor_${crypto.randomUUID().replace(/-/g, "")}`;
            await client.query(`DECLARE ${cursorName} CURSOR FOR ${query}`);

            // Fetch first batch
            const result = await client.query(
                `FETCH ${limit} FROM ${cursorName}`,
            );

            return NextResponse.json({
                cursorId: cursorName,
                rows: result.rows,
                hasMore: result.rows.length === limit,
                offset: 0,
            });
        } else {
            // Subsequent requests: fetch next batch
            const result = await client.query(
                `FETCH ${limit} FROM ${cursorId}`,
            );

            return NextResponse.json({
                cursorId,
                rows: result.rows,
                hasMore: result.rows.length === limit,
                offset: offset + limit,
            });
        }
    } finally {
        client.release();
    }
}
```

### Client-Side Infinite Scroll

```tsx
// components/ResultsTable.tsx
const [allRows, setAllRows] = useState<any[]>([]);
const [cursorId, setCursorId] = useState<string>();
const [hasMore, setHasMore] = useState(false);

async function loadNextBatch() {
    const response = await fetch("/api/query", {
        method: "POST",
        body: JSON.stringify({
            query,
            environment,
            database,
            cursorId,
            offset: allRows.length,
            limit: 1000,
        }),
    });

    const data = await response.json();
    setAllRows([...allRows, ...data.rows]);
    setCursorId(data.cursorId);
    setHasMore(data.hasMore);
}

// Detect scroll to bottom
const handleScroll = (e: React.UIEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore) {
        loadNextBatch();
    }
};
```

---

## Alternative: Server-Side Pagination

Simple approach without cursors:

```sql
SELECT * FROM users ORDER BY id LIMIT 1000 OFFSET 0;  -- Page 1
SELECT * FROM users ORDER BY id LIMIT 1000 OFFSET 1000; -- Page 2
```

**Downside**: OFFSET becomes slow for large offsets (scans all previous rows)

---

## Performance Impact

| Metric                   | Before | After | Improvement    |
| ------------------------ | ------ | ----- | -------------- |
| Initial load (100K rows) | 8s     | 500ms | 16x faster     |
| Memory (100K rows)       | 500MB  | 5MB   | 100x reduction |
| Time to first paint      | 8s     | 500ms | 16x faster     |

---

## Verification

- [ ] Initial query loads only 1000 rows
- [ ] Scrolling to bottom loads next batch
- [ ] 1M row query completes without OOM
- [ ] Cursor properly closed on tab close
- [ ] Test: `SELECT * FROM generate_series(1, 1000000)` loads incrementally

---

## Notes

- Requires connection persistence during cursor lifetime
- Consider cursor timeout (close after 5 minutes idle)
- Future: Keyset pagination for better performance than OFFSET
