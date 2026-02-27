# P1-002: No Query Observability

**Priority**: P1 (High)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 2 hours

---

## Problem

Zero visibility into query execution:

- No logging of slow queries
- No failure tracking
- No query history/audit trail
- Cannot debug "why is this slow?" issues

When user reports "query took forever", no way to investigate.

---

## Risk Assessment

- **Debuggability**: Cannot diagnose performance issues
- **Compliance**: No audit trail for data access
- **Security**: Cannot detect malicious queries

---

## Solution

### Step 1: Add Structured Logging

```typescript
// lib/queryLogger.ts
export interface QueryLog {
    timestamp: Date;
    environment: string;
    database: string;
    query: string;
    duration_ms: number;
    rowCount: number;
    success: boolean;
    error?: string;
    user?: string; // Future: auth integration
}

const queryLogs: QueryLog[] = [];

export function logQuery(log: QueryLog) {
    queryLogs.push(log);

    // Console output
    const emoji = log.success ? "✅" : "❌";
    const duration = `${log.duration_ms}ms`;
    const rows = log.success ? `${log.rowCount} rows` : log.error;

    console.log(
        `${emoji} [${log.environment}/${log.database}] ${duration} ${rows}`,
    );

    // Slow query warning
    if (log.duration_ms > 1000) {
        console.warn("🐌 SLOW QUERY:", log.query.substring(0, 100));
    }

    // Keep last 1000 logs in memory
    if (queryLogs.length > 1000) {
        queryLogs.shift();
    }
}

export function getRecentLogs(limit = 100): QueryLog[] {
    return queryLogs.slice(-limit);
}
```

### Step 2: Instrument Query API

```typescript
// app/api/query/route.ts
const startTime = Date.now();
let result;
let error;

try {
    result = await pool.query(query);
    logQuery({
        timestamp: new Date(),
        environment: env.id,
        database,
        query,
        duration_ms: Date.now() - startTime,
        rowCount: result.rows.length,
        success: true,
    });
} catch (err: any) {
    logQuery({
        timestamp: new Date(),
        environment: env.id,
        database,
        query,
        duration_ms: Date.now() - startTime,
        rowCount: 0,
        success: false,
        error: err.message,
    });
    throw err;
}
```

### Step 3: Add Query History UI

```tsx
// components/QueryHistory.tsx
export function QueryHistory() {
    const [logs, setLogs] = useState<QueryLog[]>([]);

    useEffect(() => {
        fetch("/api/logs")
            .then((r) => r.json())
            .then(setLogs);
    }, []);

    return (
        <div>
            <h3>Recent Queries</h3>
            {logs.map((log) => (
                <div key={log.timestamp}>
                    <span
                        className={
                            log.success ? "text-green-500" : "text-red-500"
                        }
                    >
                        {log.duration_ms}ms
                    </span>
                    <code>{log.query.substring(0, 80)}...</code>
                </div>
            ))}
        </div>
    );
}
```

### Step 4: Export to File/Database

For production, persist to:

- JSON file: `logs/queries-2026-02-27.jsonl`
- Database: `INSERT INTO query_log (...)`
- External: DataDog, Splunk, CloudWatch

---

## Verification

- [ ] All queries logged to console
- [ ] Slow queries (>1s) highlighted
- [ ] Failed queries logged with error
- [ ] Query history visible in UI
- [ ] Logs rotated/limited to prevent memory leak

---

## Notes

- P2 enhancement: EXPLAIN ANALYZE integration
- Future: User attribution once auth added
- Consider privacy: redact sensitive data in logs
