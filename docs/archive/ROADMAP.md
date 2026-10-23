# pgLite Feature Roadmap

This document outlines potential features and improvements for pgLite, organized by priority and complexity.

## 🔥 Quick Wins (High Impact, Low Effort)

### 1. Query History

**What**: Store and display the last 50 executed queries with timestamps
**Why**: Users frequently need to re-run or reference previous queries
**Effort**: Medium (2-3 hours)

**Implementation**:

- Add `localStorage` to persist query history as JSON array
- Create new component: `components/QueryHistory.tsx` with sidebar panel
- Structure: `{ id, query, timestamp, database, duration, rowCount }`
- Add search/filter input to find queries
- Click history item to populate current tab

**Files to modify**:

- `app/page.tsx` - Add history state and save on query execution
- `components/QueryHistory.tsx` - New component with list UI
- Layout adjustment for collapsible history panel

**Dependencies**: None (use native localStorage)

---

### 2. Execution Time Display

**What**: Show how long each query took to execute
**Why**: Performance monitoring and query optimization feedback
**Effort**: Easy (30 mins)

**Implementation**:

- Modify API route to track execution time using `performance.now()`
- Return `executionTime` in query response
- Display in ResultsTable header: "1,234 rows in 234ms"

**Files to modify**:

- `app/api/query/route.ts` - Add timing before/after query execution
- `components/ResultsTable.tsx` - Display execution time in header
- Update `QueryResult` interface to include `executionTime?: number`

**Code snippet**:

```typescript
const startTime = performance.now();
const result = await client.query(query);
const executionTime = performance.now() - startTime;
return { ...result, executionTime };
```

---

### 3. Row Count Badge

**What**: Display total rows returned prominently in results
**Why**: Quick feedback on query result size
**Effort**: Easy (15 mins)

**Implementation**:

- Add badge to ResultsTable header
- Format large numbers with commas (e.g., "1,234 rows")
- Color code: green (<100), yellow (100-10k), red (>10k)

**Files to modify**:

- `components/ResultsTable.tsx` - Add styled badge component

**Code snippet**:

```tsx
<div className="flex items-center gap-2">
    <span className="text-sm text-gray-400">
        {result.rowCount.toLocaleString()} rows
    </span>
</div>
```

---

### 4. SQL Formatter

**What**: Beautify/format SQL queries with proper indentation
**Why**: Improves readability of complex queries
**Effort**: Medium (1 hour)

**Implementation**:

- Install package: `npm install sql-formatter`
- Add "Format" button to QueryTabs toolbar
- Format current tab's query on click

**Files to modify**:

- `package.json` - Add sql-formatter dependency
- `components/QueryTabs.tsx` - Add format button and handler

**Code snippet**:

```typescript
import { format } from "sql-formatter";

const formatQuery = () => {
    const formatted = format(activeTab.query, {
        language: "postgresql",
        tabWidth: 2,
        keywordCase: "upper",
    });
    updateTabQuery(activeTabId, formatted);
};
```

**Dependencies**: `sql-formatter` package

---

### 5. Keyboard Shortcuts Panel

**What**: Help modal showing all available keyboard shortcuts
**Why**: Discoverability of existing features
**Effort**: Easy (1 hour)

**Implementation**:

- Create modal component: `components/ShortcutsModal.tsx`
- Trigger with `Cmd+K` or `?` key
- Show list of all shortcuts in organized table

**Shortcuts to document**:

- `Cmd+Enter` - Run query
- `Cmd+/` - Toggle comment
- `Tab` - Autocomplete
- `Ctrl+Space` - Force autocomplete
- `Cmd+K` - Show shortcuts

**Files to create**:

- `components/ShortcutsModal.tsx` - Modal UI component
- `app/page.tsx` - Add global keyboard listener for Cmd+K

---

## 💎 Professional Features (High Impact, Medium Effort)

### 6. Table Data Viewer

**What**: Click a table in the tree to browse its data with pagination
**Why**: Quick data inspection without writing SELECT queries
**Effort**: Medium (3-4 hours)

**Implementation**:

- Add click handler to DatabaseTree table items
- Create API route: `app/api/table-data/route.ts`
- Query: `SELECT * FROM {table} LIMIT 100 OFFSET {offset}`
- Display in ResultsTable with pagination controls
- Add prev/next buttons and page number input

**Files to modify**:

- `components/DatabaseTree.tsx` - Add click handler on table names
- `app/api/table-data/route.ts` - New API endpoint
- `components/ResultsTable.tsx` - Add pagination UI
- `app/page.tsx` - Add pagination state

**API Parameters**:

```typescript
POST /api/table-data
{
  database: string,
  table: string,
  page: number,
  pageSize: number
}
```

---

### 7. Saved Queries & Snippets

**What**: Star/save favorite queries with custom names and folders
**Why**: Reuse common queries, build snippet library
**Effort**: High (4-5 hours)

**Implementation**:

- Add sidebar section for saved queries
- localStorage structure: `{ id, name, query, folder, starred, tags }`
- Create modal for organizing into folders
- Add star icon to query tabs
- Drag-and-drop to organize

**Files to create**:

- `components/SavedQueries.tsx` - Sidebar panel
- `components/SaveQueryModal.tsx` - Dialog for naming/organizing
- `lib/queryStorage.ts` - CRUD operations for saved queries

**Features**:

- Create/rename/delete folders
- Star important queries
- Tag queries for searching
- Export/import as JSON

---

### 8. Query Explain (Execution Plan)

**What**: Show PostgreSQL's execution plan for query optimization
**Why**: Performance tuning and understanding query behavior
**Effort**: Medium (2-3 hours)

**Implementation**:

- Add "Explain" button next to "Run Query"
- Prepend `EXPLAIN ANALYZE` to query
- Display results in tree/table format
- Highlight expensive operations in red

**Files to modify**:

- `components/QueryTabs.tsx` - Add explain button
- `app/api/query/route.ts` - Handle explain queries
- `components/ExplainView.tsx` - New component for plan visualization

**Display format**:

```
Seq Scan on users (cost=0.00..35.50 rows=2550 width=36)
  └─ Filter: (created_at > '2024-01-01')
```

---

### 9. Transaction Controls

**What**: BEGIN, COMMIT, ROLLBACK buttons for manual transaction management
**Why**: Test changes safely before committing
**Effort**: Medium (2 hours)

**Implementation**:

- Add transaction state: 'none' | 'active' | 'committed' | 'rolled-back'
- Create persistent connection for transaction session
- Show warning banner when in transaction mode
- Disable switching databases during transaction

**Files to modify**:

- `app/page.tsx` - Add transaction state
- `components/QueryTabs.tsx` - Add transaction control buttons
- `app/api/transaction/route.ts` - Handle BEGIN/COMMIT/ROLLBACK

**UI States**:

- Active transaction: Yellow banner "Transaction in progress"
- Auto-rollback on connection loss
- Confirm navigation away during active transaction

---

### 10. Column Sorting in Results

**What**: Click column headers to sort result data client-side
**Why**: Quick data exploration without re-querying
**Effort**: Easy (1-2 hours)

**Implementation**:

- Add sort state: `{ column: string, direction: 'asc' | 'desc' }`
- Make column headers clickable with sort icon
- Sort rows array using JavaScript sort
- Preserve original order (add "Clear sort" button)

**Files to modify**:

- `components/ResultsTable.tsx` - Add sort logic and UI

**Code snippet**:

```typescript
const sortedRows = [...result.rows].sort((a, b) => {
    const valA = a[sortColumn];
    const valB = b[sortColumn];
    return sortDirection === "asc"
        ? valA > valB
            ? 1
            : -1
        : valA < valB
          ? 1
          : -1;
});
```

---

## 🎨 UX Improvements (Medium Priority)

### 11. Search in Tree

**What**: Filter databases/tables/columns by name in sidebar
**Why**: Quick navigation in large databases
**Effort**: Easy (1 hour)

**Implementation**:

- Add search input at top of DatabaseTree
- Filter tree items using `includes()` or fuzzy search
- Highlight matching text
- Auto-expand parent nodes of matches

**Files to modify**:

- `components/DatabaseTree.tsx` - Add search state and filter logic

---

### 12. Table Info Panel

**What**: Click table to see metadata: indexes, constraints, row count, size
**Why**: Database exploration and optimization insights
**Effort**: Medium (2-3 hours)

**Implementation**:

- Create API route to query pg_catalog for table metadata
- Show in collapsible panel or modal
- Display: indexes, foreign keys, triggers, row count, table size

**Queries needed**:

```sql
-- Row count
SELECT COUNT(*) FROM {table};

-- Table size
SELECT pg_size_pretty(pg_total_relation_size('{table}'));

-- Indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '{table}';

-- Constraints
SELECT conname, contype FROM pg_constraint WHERE conrelid = '{table}'::regclass;
```

**Files to create**:

- `app/api/table-info/route.ts` - Metadata endpoint
- `components/TableInfoPanel.tsx` - Display component

---

### 13. Connection Status Indicator

**What**: Green/red dot showing database connection health
**Why**: Immediate feedback on connectivity issues
**Effort**: Easy (30 mins)

**Implementation**:

- Add `/api/health` endpoint that runs simple `SELECT 1`
- Poll every 30 seconds
- Display colored dot in header with tooltip
- Show last check time on hover

**Files to create**:

- `app/api/health/route.ts` - Health check endpoint
- `components/ConnectionStatus.tsx` - Status indicator
- `app/page.tsx` - Add polling logic with setInterval

---

### 14. Auto-save Query Tabs

**What**: Persist all query tabs in localStorage, survive page refresh
**Why**: Never lose work, seamless experience
**Effort**: Medium (1-2 hours)

**Implementation**:

- Save tabs array to localStorage on every change
- Load from localStorage on mount
- Add "Restore tabs" prompt if found
- Clear on logout/reset button

**Files to modify**:

- `components/QueryTabs.tsx` - Add useEffect to sync with localStorage
- Add debouncing to avoid excessive writes

**Code pattern**:

```typescript
useEffect(() => {
    const savedTabs = localStorage.getItem("queryTabs");
    if (savedTabs) {
        setTabs(JSON.parse(savedTabs));
    }
}, []);

useEffect(() => {
    localStorage.setItem("queryTabs", JSON.stringify(tabs));
}, [tabs]);
```

---

### 15. Inline Data Editing

**What**: Double-click cell in results to edit value, auto-generate UPDATE
**Why**: Quick data fixes without writing SQL
**Effort**: High (5-6 hours)

**Implementation**:

- Make result cells editable on double-click
- Track primary key for row identification
- Generate UPDATE query: `UPDATE {table} SET {column} = {value} WHERE {pk} = {id}`
- Show confirmation dialog before executing
- Optimistic UI update

**Challenges**:

- Identify primary key (need schema metadata)
- Handle tables without PK (use CTID)
- Validation and type checking
- Concurrent modification detection

**Files to modify**:

- `components/ResultsTable.tsx` - Add edit mode and logic
- Requires table metadata from feature #12

---

## 🚀 Advanced Features (Low Priority, High Effort)

### 16. Multiple Connections

**What**: Manage and switch between multiple database connections
**Why**: Work with dev/staging/prod environments
**Effort**: High (6-8 hours)

**Implementation**:

- Create connection manager UI
- Store connections in localStorage (encrypt credentials)
- Add dropdown to switch active connection
- Color-code environments (red for prod)
- Test connection before saving

**Files to create**:

- `components/ConnectionManager.tsx` - Manage connections
- `lib/connections.ts` - Connection CRUD logic
- `app/api/test-connection/route.ts` - Validate connection

**Security considerations**:

- Use Web Crypto API to encrypt stored passwords
- Clear credentials on browser close option
- Warning when connecting to production

---

### 17. Schema Visualization (ER Diagram)

**What**: Generate entity-relationship diagram from database schema
**Why**: Understand table relationships and database structure
**Effort**: Very High (10-12 hours)

**Implementation**:

- Query foreign keys from pg_catalog
- Use library like `react-flow` or `d3` for visualization
- Auto-layout algorithm for positioning tables
- Click table to highlight relationships
- Zoom and pan controls

**Dependencies**:

- `react-flow` or `reactflow` for diagram rendering
- Query foreign keys: `SELECT * FROM information_schema.table_constraints`

**Files to create**:

- `components/SchemaVisualizer.tsx` - Diagram component
- `app/api/schema/route.ts` - Fetch relationships
- `lib/layoutAlgorithm.ts` - Auto-positioning logic

---

### 18. Import Data (CSV/JSON)

**What**: Upload files and insert data into tables
**Why**: Bulk data operations, migrations
**Effort**: High (4-5 hours)

**Implementation**:

- File upload component with drag-and-drop
- Parse CSV with `papaparse` or JSON.parse
- Map columns to table schema
- Generate batch INSERT statements
- Progress indicator for large files

**Dependencies**:

- `papaparse` for CSV parsing
- `react-dropzone` for file upload UI

**Features**:

- Column mapping UI (CSV header → table column)
- Data preview before import
- Validate data types
- Handle duplicates (skip/update/error)
- Transaction wrapper for all-or-nothing import

**Files to create**:

- `components/ImportData.tsx` - Upload and mapping UI
- `app/api/import/route.ts` - Process and insert data

---

### 19. Database Diff

**What**: Compare schemas between two databases
**Why**: Migration verification, environment sync
**Effort**: Very High (8-10 hours)

**Implementation**:

- Select two databases/connections to compare
- Query schema from both: tables, columns, indexes, constraints
- Generate diff report showing additions/deletions/modifications
- Color code changes (green/red/yellow)
- Generate migration SQL

**Diff categories**:

- Tables: added, removed, modified
- Columns: type changes, nullable changes
- Indexes: missing/extra indexes
- Constraints: FK differences

**Files to create**:

- `components/SchemaDiff.tsx` - Comparison UI
- `lib/diffEngine.ts` - Schema comparison logic
- `lib/migrationGenerator.ts` - Generate ALTER statements

---

### 20. AI Query Assistant

**What**: Generate SQL from natural language using OpenAI
**Why**: Lower barrier for non-SQL users
**Effort**: Medium (3-4 hours) + API costs

**Implementation**:

- Add text input: "Show me all users who signed up last week"
- Send to OpenAI API with schema context
- Display generated SQL in editor
- User can review and edit before executing

**Dependencies**:

- `openai` package
- OpenAI API key (user provides or backend .env)

**Prompt engineering**:

```javascript
const prompt = `Given this PostgreSQL schema:
${JSON.stringify(tableColumns)}

Generate a SQL query for: "${userRequest}"

Return only the SQL query, no explanation.`;
```

**Files to create**:

- `components/AIQueryInput.tsx` - Natural language input
- `app/api/ai-query/route.ts` - OpenAI integration

**Cost considerations**:

- Rate limiting
- Cache common queries
- Estimate cost per query

---

## 🛠️ Developer Tools

### 21. Query Variables

**What**: Support placeholders like `{{userId}}` with input fields
**Why**: Parameterized queries, reduce SQL injection risk
**Effort**: Medium (3-4 hours)

**Implementation**:

- Parse query for `{{variableName}}` patterns
- Show input fields above editor for each variable
- Replace variables before execution
- Save variable values with query history

**Example**:

```sql
SELECT * FROM users WHERE id = {{userId}} AND status = {{status}}
```

Shows input fields for `userId` and `status`

**Files to modify**:

- `components/QueryTabs.tsx` - Parse and display variable inputs
- `app/page.tsx` - Variable substitution logic

---

### 22. Dark/Light Theme Toggle

**What**: Switch between dark and light color schemes
**Effort**: Medium (2-3 hours)

**Implementation**:

- Already using Tailwind dark mode
- Add theme toggle button to header
- Store preference in localStorage
- Update Monaco editor theme: `vs-dark` / `vs-light`

**Files to modify**:

- `app/layout.tsx` - Add theme provider
- `components/ThemeToggle.tsx` - Toggle button
- `components/SQLEditor.tsx` - Dynamic theme prop

---

### 23. Export Schema (DDL)

**What**: Download CREATE TABLE statements for selected tables
**Why**: Schema backups, documentation, migrations
**Effort**: Medium (2-3 hours)

**Implementation**:

- Query `pg_dump` or construct DDL from information_schema
- Multi-select tables in tree
- Export button generates SQL file
- Include indexes, constraints, comments

**Query approach**:

```sql
SELECT
  'CREATE TABLE ' || table_name || ' (' ||
  string_agg(column_definition, ', ') || ');'
FROM information_schema.columns
WHERE table_name = '{table}'
GROUP BY table_name;
```

**Files to create**:

- `app/api/export-schema/route.ts` - Generate DDL
- `components/DatabaseTree.tsx` - Add multi-select and export button

---

### 24. Bulk Operations

**What**: Execute same query across multiple databases
**Why**: Multi-tenant maintenance, consistent updates
**Effort**: High (4-5 hours)

**Implementation**:

- Checkbox to enable "bulk mode"
- Multi-select databases
- Execute query sequentially with progress bar
- Aggregate results: success count, errors per database
- Rollback strategy

**Safety features**:

- Preview mode (dry run)
- Require confirmation for destructive queries (DELETE, DROP)
- Parallel execution option with concurrency limit
- Stop on first error vs. continue

**Files to create**:

- `components/BulkQueryRunner.tsx` - Multi-DB UI
- `app/api/bulk-query/route.ts` - Sequential execution

---

## Priority Recommendations

**Start with these 5 for maximum impact**:

1. ✅ **Execution Time Display** - Easy win, immediate value
2. ✅ **Row Count Badge** - 15 minutes, big UX improvement
3. ✅ **Table Data Viewer** - High usage feature
4. ✅ **Query History** - Professional must-have
5. ✅ **Auto-save Query Tabs** - Prevents data loss

**Next tier (polish and professionalism)**: 6. SQL Formatter 7. Column Sorting 8. Connection Status 9. Search in Tree 10. Keyboard Shortcuts Panel

**Advanced (when ready to go pro)**: 11. Saved Queries & Snippets 12. Table Info Panel 13. Query Explain 14. Multiple Connections 15. Schema Visualization

---

## Technical Notes

### localStorage Schema

```typescript
interface StorageSchema {
    queryTabs: Tab[];
    queryHistory: QueryHistoryItem[];
    savedQueries: SavedQuery[];
    connections: Connection[];
    preferences: {
        theme: "dark" | "light";
        autoSave: boolean;
        fontSize: number;
    };
}
```

### Performance Considerations

- Debounce localStorage writes (300ms)
- Limit query history to 50-100 items
- Paginate large result sets (>1000 rows)
- Use React.memo for heavy components
- Lazy load Monaco editor (already done)

### Security Best Practices

- Never log credentials
- Encrypt stored passwords
- Use prepared statements for variables
- CORS validation on API routes
- Rate limiting for AI features
- Confirm destructive operations (DROP, DELETE)

---

## Package Dependencies Summary

Packages you'll need to install:

```bash
npm install sql-formatter          # Feature 4: SQL Formatter
npm install papaparse              # Feature 18: CSV import
npm install react-dropzone         # Feature 18: File upload
npm install openai                 # Feature 20: AI assistant
npm install reactflow              # Feature 17: Schema visualization
npm install lucide-react           # Additional icons
```

Optional:

```bash
npm install zod                    # Input validation
npm install date-fns               # Date formatting in history
npm install @tanstack/react-table # Advanced table features
```

---

**Total estimated effort**: 80-120 hours for all features  
**MVP (features 1-5)**: 10-12 hours  
**Professional tier (features 1-10)**: 30-35 hours
