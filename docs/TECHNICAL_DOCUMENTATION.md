# pgLite Technical Documentation

## 1. High-Level Overview

**Product**: Web-based PostgreSQL database management console  
**Problem Solved**: Provides multi-environment database access without installing desktop tools. Enables read-only protection for production databases.  
**Target Users**: Backend engineers, DevOps teams, database administrators managing multiple PostgreSQL environments (dev, staging, UAT, production).

**Core Capabilities**:

- Execute SQL queries across 7 configured environments
- Browse database schemas (tables, columns, types)
- Per-tab environment/database isolation
- Read-only mode enforcement
- Export results as CSV/JSON
- Virtual scrolling for large result sets (3000+ rows)

---

## 2. Architecture

### Frontend Structure

```
app/
├── page.tsx                    # Main UI orchestration
├── api/
│   ├── query/route.ts         # Query execution endpoint
│   ├── columns/route.ts       # Schema metadata endpoint
│   └── databases/route.ts     # Database list endpoint
components/
├── QueryTabs.tsx              # Tab management + env/db selectors
├── SQLEditor.tsx              # Monaco-based SQL editor
├── DatabaseTree.tsx           # Schema browser sidebar
└── ResultsTable.tsx           # Virtual scrolling results grid
lib/
├── db.ts                      # Connection pool factory
└── environments.ts            # Environment configurations
```

### Backend Structure

- **Next.js 16 App Router**: API routes handle PostgreSQL connections
- **node-postgres (pg)**: PostgreSQL driver with connection pooling
- **No ORM**: Direct SQL execution for transparency

### Request Flow

1. User clicks "Run Query" → `page.tsx` calls `/api/query` POST
2. API route calls `createPool(environment, database)`
3. Pool executes query via `pool.query(sql)`
4. Results serialized to JSON → sent to client
5. Pool explicitly closed with `pool.end()` in finally block

### Connection Pooling Pattern

**File**: `lib/db.ts`

```typescript
export function createPool(environment: string, database?: string): Pool;
```

- Creates **new pool per request** (not global singleton)
- Uses `pg`'s internal connection pooling (max 10 connections, 30s idle timeout)
- Caller responsible for cleanup: `await pool.end()` in API route finally blocks
- No connection reuse across requests to prevent state leakage

**Why per-request pools?**  
Multiple simultaneous queries to different databases require isolated pools. Global pools would need complex keying logic. Current approach: simple, safe, pg handles actual connection reuse internally.

---

## 3. Environment & Database Handling

### Environment Storage

**File**: `lib/environments.ts`

7 environments defined as Record<string, Environment>:

- `loadtest`: Azure PostgreSQL (no VPN)
- `sandbox`: Azure PostgreSQL (no VPN)
- `staging`: Azure PostgreSQL (no VPN)
- `vegapay-uat-snapshot`: Requires VPN
- `vegapay-uat`: Requires VPN
- `unity-uat`: Requires VPN
- `dev`: Local PostgreSQL (localhost:5432)

Each environment contains:

```typescript
{
  name: string          // Display name
  host: string          // PostgreSQL host
  port: number          // Port (5432)
  user: string          // Auth username
  password: string      // Auth password (plaintext in code)
  database: string      // Default database
  requiresVPN?: boolean // VPN requirement flag
}
```

**Security Note**: Credentials hardcoded in source. Production requires `.env` migration.

### Database Switching

**File**: `app/page.tsx`

1. **Fetch databases**: `/api/databases?environment=X` queries `pg_database`
2. **Caching**: `databasesCacheRef` + `inFlightRequestsRef` prevent duplicate fetches
3. **Per-tab isolation**: Each `QueryTab` has its own `{environment, database}` state
4. **Auto-selection**: When environment changes, first database auto-selected

**Cache Strategy**:

```typescript
databasesCacheRef.current[environment] = databases[]
inFlightRequestsRef.current[environment] = Promise<databases[]>
```

Prevents API spam during rapid tab switches. Ref-based to avoid re-render loops.

### Write Mode Protection

**File**: `app/api/query/route.ts`

```typescript
function isWriteQuery(query: string): boolean {
    const keywords = [
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "CREATE",
        "ALTER",
        "TRUNCATE",
        "REPLACE",
        "MERGE",
        "GRANT",
        "REVOKE",
    ];
    return keywords.some((kw) => query.trim().toUpperCase().startsWith(kw));
}
```

If `readOnly=true` and `isWriteQuery()=true` → HTTP 403 error.

**Bypass**: User can toggle read-only mode per tab. No server-side enforcement beyond this check.

---

## 4. Query Execution Flow

### Click "Run Query"

**File**: `app/page.tsx` → Line ~280

1. Get active tab via `queryTabsRef.current.getActiveTab()`
2. Extract `{query, environment, database, readOnly}` from tab state
3. POST to `/api/query` with JSON body
4. Show loading spinner (state: `loading=true`)
5. On response:
    - Success → `setResult(data)` wrapped in `startTransition()` (React 19 non-urgent update)
    - Error → `setError(data.error)`
6. Loading state cleared after `startTransition` completes

**Why startTransition?**  
Large result sets (3000+ rows) cause UI freeze during state update. Transition marks update as low-priority, keeping UI responsive.

### Server-Side Execution

**File**: `app/api/query/route.ts`

```typescript
1. Parse request body: { query, database, environment, readOnly }
2. Validate query not empty
3. Check write protection: if (readOnly && isWriteQuery()) → 403
4. const pool = createPool(environment, database)
5. const result = await pool.query(query)
6. Serialize: { rows, rowCount, fields: result.fields.map(f => f.name) }
7. Cleanup: await pool.end() in finally block
8. Return JSON
```

### Error Handling

- **Client errors**: Empty query → 400 "Query cannot be empty"
- **Auth errors**: Invalid credentials → 500 with `err.message`
- **Write attempts in read-only**: → 403 with detailed message
- **Network errors**: Caught in page.tsx → "Failed to connect to the server"
- **SQL errors**: PSQL error message returned verbatim in response

**No retries**. No timeout enforcement at app level (relies on pg's internal 5s connection timeout).

### Result Serialization

```typescript
{
  rows: Record<string, unknown>[]  // Array of row objects
  rowCount: number                  // Affected row count
  fields: string[]                  // Column names
}
```

DML queries (INSERT/UPDATE) return `fields: []` → UI shows success message instead of table.

---

## 5. Schema Browser

### Table Fetching

**File**: `app/api/columns/route.ts`

Query against `information_schema.tables` + `information_schema.columns`:

```sql
SELECT
  t.table_schema,
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_schema = c.table_schema
  AND t.table_name = c.table_name
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY t.table_schema, t.table_name, c.ordinal_position;
```

**Filters out**: System schemas (pg_catalog, information_schema)  
**Returns**: `Record<string, Column[]>` keyed by `"schema.table"`

### Trigger Logic

**File**: `app/page.tsx` → Line ~55

```typescript
useEffect(() => {
    if (!activeTab?.database) return;
    fetch("/api/columns", {
        body: JSON.stringify({
            database: activeTab.database,
            environment: activeTab.environment,
        }),
    });
}, [activeTab?.database, activeTab?.environment]);
```

**Triggers when**:

- Tab switches to different database
- Tab switches to different environment
- Component mounts with active tab

**Does NOT trigger when**: Query text changes (fixed memory leak from earlier implementation).

### Table Count Display

**File**: `components/DatabaseTree.tsx` → Line ~63

```typescript
{
    Object.keys(groupedTables).reduce(
        (sum, schema) => sum + groupedTables[schema].length,
        0,
    );
}
tables;
```

Counts tables across all schemas. Calculated on every render (cheap operation, ~10-50 tables typical).

### Table Click Interaction

**File**: `components/DatabaseTree.tsx` → Line ~125

```typescript
onClick={() => onTablePreview(table)}
```

Calls `handleTablePreview()` in `page.tsx`:

```typescript
const fullTableName = table.schema === 'public'
  ? table.name
  : `${table.schema}.${table.name}`;
runQuery(`SELECT * FROM ${fullTableName} LIMIT 100;`, ...);
```

**Executes immediately**. Overwrites current query editor content. No confirmation dialog.

---

## 6. State Management

### UI State (React State)

**File**: `app/page.tsx`

**Ephemeral (lost on refresh)**:

```typescript
activeTab: QueryTab | null; // Current tab context
result: QueryResult | null; // Last query result
error: string | null; // Last error message
loading: boolean; // Query execution state
tableColumns: Record<string, Column[]>; // Schema cache for current db
databasesByEnv: Record<string, string[]>; // Database list cache
```

**Tabs State** (in `QueryTabs.tsx`):

```typescript
tabs: QueryTab[] = [{
  id: string
  name: string        // "Loadtest • billing" or custom
  query: string       // SQL text
  environment: string // "loadtest"
  database: string    // "billing"
  readOnly: boolean   // Write protection toggle
}]
```

**No Persistence**:

- Query text lost on refresh
- Tab configuration lost
- Result sets cleared
- No localStorage/sessionStorage usage
- No server-side session

**Why refs?**  
`queryTabsRef`, `databasesCacheRef`, `inFlightRequestsRef` used to:

1. Access current state without re-render triggers
2. Cache data without dependency array inclusion
3. Prevent infinite loops in useCallback/useEffect

---

## 7. Performance & Safety

### Virtual Scrolling

**File**: `components/ResultsTable.tsx` → Line ~28

```typescript
const ROW_HEIGHT = 41; // px
const OVERSCAN = 5; // extra rows above/below viewport

const visibleRange = useMemo(() => {
    const visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
    const start = Math.floor(scrollTop / ROW_HEIGHT);
    const end = start + visibleRows;
    return {
        start: Math.max(0, start - OVERSCAN),
        end: Math.min(result.rows.length, end + OVERSCAN),
    };
}, [scrollTop, containerHeight, result]);
```

**Rendering**: Only ~25-30 rows in DOM at any time, regardless of dataset size.  
**Layout**: Absolute positioning with calculated `top` offset per row.  
**Performance**: 3651 rows render in <100ms vs 5+ seconds full render.

### Result Limits

- **No client-side limit**: Will attempt to render any size dataset
- **No server-side limit**: Query `SELECT * FROM huge_table` will OOM
- **Recommended**: Users manually add `LIMIT` clauses
- **Table preview**: Hardcoded `LIMIT 100` in preview queries

### Timeout Handling

**Connection timeout**: 5s (pg library default)  
**Query timeout**: None. Long-running queries block indefinitely.  
**Idle timeout**: 30s for pooled connections

**Risk**: `SELECT * FROM large_table` with no limit can:

- Block UI for minutes
- Exhaust server memory
- Crash browser tab if result exceeds RAM

### Write Protection

**Mechanism**: Regex keyword matching in `isWriteQuery()`  
**Enforcement**: HTTP 403 if `readOnly=true` AND query starts with destructive keyword  
**Bypass Methods**:

1. Toggle read-only off in UI
2. Use stored procedures that wrap writes
3. Use CTEs with `WITH ... INSERT`

**Not Protected**:

- Schema changes via pg_catalog writes
- `COPY` commands
- Custom functions that perform writes

---

## 8. Current Limitations

### Security

- **Credentials in source code**: `lib/environments.ts` contains plaintext passwords
- **No authentication**: Anyone with URL can access all environments
- **No audit logging**: No record of who ran what query when
- **No query validation**: SQL injection safe (parameterized) but no business logic validation
- **No rate limiting**: Can spam queries and exhaust connections

### Scalability

- **Per-request pools**: Creates/destroys pool for every API call (inefficient at high concurrency)
- **No result streaming**: Entire dataset loaded to memory before sending
- **No query queueing**: Concurrent queries compete for connection pool slots
- **No caching**: Same query re-executes fully every time

### Functionality

- **No query history**: Past queries lost on refresh/tab close
- **No saved queries**: No way to bookmark frequently used SQL
- **No multi-statement**: Only single query execution
- **No explain plans**: No query optimization tools
- **No CSV import**: Only export supported
- **No transaction control**: Every query auto-commits
- **No connection status**: No visibility into pool state/errors

### Data Handling

- **No pagination**: Fetches entire result set to client
- **No progressive loading**: Must wait for full query completion
- **No data editing**: Read-only grid, no inline editing
- **No filtering/sorting**: Client-side only, limited by virtual scroll implementation

### Edge Cases

- **Column width**: Fixed 200px/180px, long content truncates
- **NULL handling**: Displays "NULL" string (not distinguishable from actual "NULL" text)
- **Binary data**: Displayed as string, likely garbled
- **Large text**: Truncated in grid, full value only in tooltip
- **Timezone**: No handling, displays DB raw value

### Observable Bugs

- **Fast environment switching**: Rare race condition where wrong database list displays
- **Tab name generation**: Fails for databases without underscore separator
- **Schema browser**: Doesn't show empty databases (no tables = invisible)
- **Error messages**: PSQL errors shown raw (cryptic for non-DBAs)

### Breaking Under Scale

**Will crash at**:

- 10k+ concurrent users (connection pool exhaustion)
- 100MB+ single query result (client memory overflow)
- 100+ rapid query executions (no debounce/throttle)

**No monitoring for**:

- Failed queries
- Slow queries
- Connection leaks
- Memory leaks (potential in virtual scroll with rapid scrolling)

---

## Summary

**Production-Ready For**: Internal dev tools, low-traffic admin consoles, trusted user bases  
**Not Production-Ready For**: Public-facing apps, high-concurrency workloads, untrusted users

**Strengths**: Simple architecture, fast query execution, good UX for power users  
**Weaknesses**: No security layer, no error recovery, no query governance

**Next Critical Features** (if scaling):

1. Authentication (SSO/SAML)
2. Query result limits (server-side)
3. Audit logging
4. Environment variable credentials
5. Query timeout enforcement
