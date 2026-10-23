# Features Roadmap - Senior Analyst Requirements

**Date:** March 2, 2026  
**Perspective:** Senior Product Analyst Daily Workflow

---

## 🏆 Top 5 Must-Haves (Critical Priority)

### 1. Smart Autocomplete from Live Schema

**Status:** ❌ Not implemented  
**Impact:** 10/10 - Non-negotiable for productivity

**Features:**

- Table name suggestions while typing
- Column name suggestions (context-aware)
- Join suggestions based on foreign keys
- SQL function suggestions
- Auto schema prefix for ambiguous tables
- Snippets for common patterns (SELECT \*, JOIN, WHERE, etc.)
- Recent tables ranked higher
- Fuzzy matching (type `us` → suggests `users`)

**Example:**

```
Type: "select * from us"
Shows: users, user_sessions, user_settings
```

---

### 2. Live Execution Feedback + Cancel

**Status:** ⚠️ Partially implemented (no cancel)  
**Impact:** 10/10 - Critical for long queries

**Features:**

- ✅ Live timer ticking (00:02.34...)
- ❌ Cancel button (AbortController)
- ✅ Environment clearly visible
- ✅ Readonly/write mode visible
- ✅ Row count after execution
- ✅ Execution time display
- ❌ Data size returned
- ❌ Query PID tracking for cancellation

**Current Gaps:**

- Can't stop long-running queries
- No server-side cancellation (pg_cancel_backend)

---

### 3. Powerful Result Grid

**Status:** ⚠️ Basic implementation  
**Impact:** 9/10 - This is where web tools beat terminal

**Implemented:**

- ✅ Virtual scrolling
- ✅ Copy to clipboard
- ✅ Export CSV/JSON
- ✅ NULL styling (␀)

**Missing:**

- ❌ Column resize (drag headers)
- ❌ Column reorder (drag to reorder)
- ❌ Column hide/show
- ❌ Pin columns (freeze left/right)
- ❌ Client-side sort (click header)
- ❌ Quick filter per column
- ❌ Expand row viewer (side drawer)
- ❌ Pretty JSON formatting
- ❌ Distinct NULL vs empty string

---

### 4. Searchable Query History

**Status:** ❌ Not implemented  
**Impact:** 9/10 - Analysts repeat queries daily

**Features:**

- History per environment
- Search/filter history
- Filter by table name
- Show execution time
- Show row count
- Favorite queries
- Diff between query versions
- Re-run instantly
- Copy query to new tab
- localStorage persistence
- Export history

**Use Case:**
"What was that query I ran yesterday for failed transactions?"

---

### 5. Safe Production Mode

**Status:** ✅ Implemented (Prod write confirmation)  
**Impact:** 10/10 - Prevents disasters

**Implemented:**

- ✅ Production write confirmation dialog
- ✅ Environment color coding
- ✅ Readonly mode toggle

**Missing:**

- ❌ Red status bar for prod
- ❌ Show affected rows before commit
- ❌ Preview changes mode
- ❌ Transaction support (BEGIN/COMMIT/ROLLBACK buttons)

---

## 📊 Result Grid Enhancements (High Priority)

### 6. Column Controls

- Resize columns (drag header edge)
- Hide/show columns (right-click menu)
- Reorder columns (drag header)
- Pin left/right (freeze columns)
- Client-side sorting (click header)
- Quick filter per column (input in header)

### 7. Quick Filter Bar

**Location:** Above result grid
**Features:**

- Filter: `status = "active"`
- Client-side filtering for small datasets
- Server-side suggestion for large datasets
- Clear filters button
- Filter syntax highlighting

### 8. Expand Row Viewer

**Trigger:** Click row → side drawer opens
**Shows:**

- Pretty JSON formatting
- All fields with labels
- Copy raw JSON button
- Copy individual field
- Syntax highlighting
- Nested object expansion

---

## 🧠 Query Intelligence (High Priority)

### 9. Inline Query Intelligence

**Features:**

- Run selected text only (if highlighted)
- Estimated row count preview
- Auto EXPLAIN mode toggle
- Warn if no WHERE on large table

**Example Warning:**

```
⚠ This query may scan 12M rows. Add WHERE clause or LIMIT.
```

### 10. EXPLAIN Plan Visualization

**Status:** ❌ Not implemented  
**Impact:** 8/10 - Critical for performance tuning

**Features:**

- [Explain] button next to Run
- Show query plan as tree
- Highlight cost nodes
- Show index usage
- Sequential scan warnings
- Highlight slow operations
- Estimated vs actual rows
- Simple visual tree (not full graph)

---

## 💾 Productivity Boosters (Medium Priority)

### 11. Saved Snippets Library

**Status:** ❌ Not implemented  
**Impact:** 8/10 - Saves time on repetitive queries

**Features:**

- Snippet sidebar/panel
- Create snippet from current query
- Organize by category
- Search snippets
- Insert with keyboard (⌘K → search)
- Share snippets (export/import JSON)

**Example Snippets:**

- Top 100 recent users
- Failed transactions today
- Daily revenue query
- Count nulls in column
- Find duplicates

### 12. Table Insight Hover

**Status:** ❌ Not implemented  
**Impact:** 7/10 - Saves extra queries

**Trigger:** Hover over table name in explorer
**Shows:**

- Row count
- Table size on disk
- Last vacuum time
- Last analyze time
- Index count
- Foreign key relationships

### 13. Compare Environments

**Status:** ❌ Not implemented  
**Impact:** 9/10 - KILLER feature for banks

**Features:**

- Select query
- Choose environments (staging, prod)
- Run on both
- Side-by-side result diff
- Highlight differences
- Export diff report

**Use Case:**
"Is this data consistent between staging and prod?"

---

## 🎨 UX Polish (Medium Priority)

### 14. Instant UI Feedback

**Requirements:**

- No dead clicks
- No layout shift
- Immediate visual feedback
- Optimistic updates
- Loading states everywhere
- Skeleton screens (not spinners)

### 15. Compact Density Mode

**Status:** ❌ Not implemented  
**Impact:** 6/10 - More info on screen

**Features:**

- Toggle compact mode
- Reduced padding (32px → 24px rows)
- Smaller fonts (option)
- Hide secondary info
- More rows visible
- Keyboard shortcut to toggle

---

## 📈 Data Awareness Tools (Low Priority)

### 16. Quick Data Profiling

**Location:** Results panel
**Shows:**

- Row count summary
- Unique count per column
- NULL count per column
- Min/Max for numeric columns
- Quick distribution histogram
- Detect data types

**Not full BI, just quick insight.**

---

## 🔧 Workflow Improvements (Low Priority)

### 17. Multi-Tab Enhancements

**Current:** ✅ Basic tabs implemented
**Missing:**

- Dirty state indicator (unsaved changes)
- Duplicate tab
- Split editor view (side-by-side)
- Tab groups by environment
- Restore closed tab

### 18. Transaction Support

**Features:**

- BEGIN button
- COMMIT button
- ROLLBACK button
- Transaction indicator in status bar
- Auto-rollback on error (optional)
- Preview changes before commit

---

## 🚫 What NOT to Build (Avoid Scope Creep)

- ❌ Full BI dashboards
- ❌ Chart/graph builders
- ❌ Data transformation pipelines
- ❌ ETL tools
- ❌ Database admin (user management, backups)
- ❌ Collaboration features (yet)
- ❌ AI query generation (later)

**Focus:** Query execution tool for analysts, not full DB admin tool.

---

## 📊 Implementation Priority Matrix

### Now (Next 2 Weeks)

1. Query cancellation (P0)
2. Query history with localStorage (P0)
3. Smart autocomplete basics (P0)

### Soon (Next Month)

4. Column resize/sort (P1)
5. EXPLAIN visualization (P1)
6. Compare environments (P1)
7. Saved snippets (P1)

### Later (Next Quarter)

8. Expand row viewer
9. Table insight hover
10. Quick data profiling
11. Compact density mode
12. Transaction support

### Future (Backlog)

13. Advanced filtering
14. Query diff
15. Split editor view
16. Advanced autocomplete (AI-powered)

---

## 🎯 Success Metrics

**Analyst Productivity:**

- Queries per day increased by 30%
- Time to find past query reduced by 80%
- Production errors reduced to zero
- Autocomplete usage >70%

**Tool Preference:**

- Preferred over terminal for 90% of queries
- Preferred over IDE for quick lookups
- Used daily by entire team

---

## 💡 Competitive Edge

**vs Terminal:**

- ✅ Visual result grid
- ✅ Easy export
- ✅ History
- ✅ Autocomplete
- ✅ Environment safety

**vs IDE (DataGrip/DBeaver):**

- ✅ Web-based (no install)
- ✅ Environment comparison
- ✅ Production safety
- ✅ Lightweight
- ✅ Fast startup

**vs Cloud Tools (AWS Console):**

- ✅ Multi-environment
- ✅ Query history
- ✅ Better autocomplete
- ✅ Saved snippets
- ✅ Local-first

---

## 🧠 Role-Specific Priorities

### Data Analyst (Primary Target)

1. Smart autocomplete ⭐⭐⭐⭐⭐
2. Query history ⭐⭐⭐⭐⭐
3. Powerful grid ⭐⭐⭐⭐⭐
4. Compare envs ⭐⭐⭐⭐
5. Snippets ⭐⭐⭐⭐

### Backend Engineer

1. Query cancel ⭐⭐⭐⭐⭐
2. EXPLAIN plan ⭐⭐⭐⭐⭐
3. Transaction support ⭐⭐⭐⭐
4. Autocomplete ⭐⭐⭐
5. History ⭐⭐

### DevOps Engineer

1. Environment safety ⭐⭐⭐⭐⭐
2. Compare envs ⭐⭐⭐⭐⭐
3. History ⭐⭐⭐⭐
4. Snippets ⭐⭐⭐
5. Cancel query ⭐⭐⭐

---

## Next Steps

1. Review this roadmap with team
2. Pick top 3 features to implement this week
3. Design detailed specs for chosen features
4. Implement incrementally
5. Get analyst feedback early

**Recommendation:** Start with Query History + Autocomplete + Cancel Query
