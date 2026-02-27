# P2-002: No EXPLAIN Analysis UI

**Priority**: P2 (Medium)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 3 days

---

## Problem

When query is slow (>1s), user has no tools to diagnose:

- No visibility into query plan
- No index usage analysis
- No cost/timing breakdown
- No optimization suggestions

User must manually run `EXPLAIN ANALYZE` and interpret raw output.

---

## Impact Assessment

- **Developer Productivity**: Hours wasted debugging slow queries
- **Database Performance**: Unoptimized queries run in production
- **UX**: Users abandon tool for pgAdmin/DataGrip which have EXPLAIN viewers

---

## Solution

### Step 1: Add EXPLAIN Toggle

```tsx
// components/SQLEditor.tsx
const [showExplain, setShowExplain] = useState(false)

<label>
  <input type="checkbox" checked={showExplain} onChange={(e) => setShowExplain(e.target.checked)} />
  EXPLAIN ANALYZE
</label>
```

### Step 2: Run EXPLAIN on Backend

```typescript
// app/api/query/route.ts
let finalQuery = query;
if (showExplain) {
    finalQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
}

const result = await pool.query(finalQuery);

if (showExplain) {
    return NextResponse.json({
        explain: result.rows[0]["QUERY PLAN"],
        isExplain: true,
    });
} else {
    return NextResponse.json({
        rows: result.rows,
        rowCount: result.rows.length,
    });
}
```

### Step 3: Visualize Query Plan

```tsx
// components/ExplainViewer.tsx
interface ExplainNode {
    "Node Type": string;
    "Total Cost": number;
    "Actual Total Time": number;
    Plans?: ExplainNode[];
}

export function ExplainViewer({ plan }: { plan: ExplainNode }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="border-l-2 border-blue-500 pl-4">
            <div className="flex items-center gap-2">
                <button onClick={() => setExpanded(!expanded)}>
                    {expanded ? "▼" : "▶"}
                </button>

                <span className="font-bold">{plan["Node Type"]}</span>

                <span className="text-gray-500">
                    Cost: {plan["Total Cost"]} | Time:{" "}
                    {plan["Actual Total Time"]}ms
                </span>
            </div>

            {expanded &&
                plan.Plans?.map((child, i) => (
                    <ExplainViewer key={i} plan={child} />
                ))}
        </div>
    );
}
```

### Step 4: Highlight Performance Issues

```tsx
function getPerformanceColor(node: ExplainNode) {
    const time = node["Actual Total Time"];
    if (time > 1000) return "bg-red-100"; // Slow
    if (time > 100) return "bg-yellow-100"; // Medium
    return "bg-green-100"; // Fast
}
```

### Step 5: Add Index Suggestions

```typescript
function analyzeExplain(plan: ExplainNode): string[] {
    const suggestions = [];

    if (plan["Node Type"] === "Seq Scan") {
        suggestions.push(`⚠️ Sequential scan on table. Consider adding index.`);
    }

    if (plan["Node Type"] === "Nested Loop" && plan["Actual Rows"] > 10000) {
        suggestions.push(`⚠️ Nested loop with many rows. Consider hash join.`);
    }

    return suggestions;
}
```

---

## Example Output

```
✅ Bitmap Heap Scan on users (Cost: 45.2, Time: 12ms)
  ✅ Bitmap Index Scan on users_email_idx (Cost: 5.1, Time: 2ms)

⚠️ Seq Scan on orders (Cost: 12500, Time: 1850ms)
  Suggestion: Add index on orders.user_id
```

---

## Reference Tools

- **pgAdmin**: Visual EXPLAIN with flamegraph
- **DataGrip**: Color-coded plan tree
- **pgMustard**: AI-powered query optimization

---

## Verification

- [ ] EXPLAIN toggle runs query plan
- [ ] Query plan rendered as tree
- [ ] Slow nodes highlighted in red
- [ ] Index scan vs sequential scan identified
- [ ] Cost and timing shown per node

---

## Notes

- Use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for structured output
- Future: Save EXPLAIN results for comparison (before/after optimization)
- Consider AI integration: "Suggest optimizations for this query"
