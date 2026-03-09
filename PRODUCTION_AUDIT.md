# Production Readiness Audit

Generated: March 2, 2026

## Executive Summary

**Status: NEEDS WORK - 43 issues identified**

- 🔴 Critical (P0): 8 security & reliability issues
- 🟡 High (P1): 10 performance & UX issues
- 🟢 Medium (P2): 17 UI polish items
- ⚪ Low (P3): 8 nice-to-have features

---

## 🔴 CRITICAL (P0) - Security & Reliability

### P0-001: SQL Injection in /api/tables/route.ts ⚠️

**Status:** FOUND
**File:** `app/api/tables/route.ts`
**Issue:** Hardcoded `POSTGRES_*` env vars instead of using environments system
**Risk:** Bypasses environment switching, potential security issue
**Fix:** Use `createPool(environment, database)` like other routes

### P0-002: Missing Environment Validation ⚠️

**Status:** OPEN
**File:** `lib/environments.ts`
**Issue:** No validation that required env vars are set (all fallback to empty strings)
**Risk:** Silent failures, confusing errors when credentials missing
**Fix:** Add startup validation, throw errors if critical vars missing

### P0-003: No Query Timeout ⚠️

**Status:** OPEN
**File:** `app/api/query/route.ts`
**Issue:** Queries can run indefinitely, blocking resources
**Risk:** Runaway queries, resource exhaustion, poor UX
**Fix:** Add `statement_timeout` per query

### P0-004: No Global Connection Pool Management ⚠️

**Status:** OPEN
**File:** `lib/db.ts`
**Issue:** Every query creates new pool, no global limit tracking
**Risk:** Connection exhaustion, database overload
**Fix:** Implement global pool cache with limits

### P0-005: .env Files Should Not Be Committed ⚠️

**Status:** OPEN
**Files:** `.env.loadtest`, `.env.sandbox`, etc.
**Issue:** 12 .env files tracked in git with potential credentials
**Risk:** **CRITICAL SECURITY ISSUE** - credentials in version control
**Fix:** Delete all .env files except .env.local.example, update .gitignore

### P0-006: No React Error Boundaries ⚠️

**Status:** OPEN
**File:** `app/page.tsx`, `app/layout.tsx`
**Issue:** Uncaught errors crash entire app
**Risk:** Poor UX, no error recovery
**Fix:** Add error boundary wrapper

### P0-007: No API CORS Configuration ⚠️

**Status:** OPEN
**Files:** All API routes
**Issue:** APIs exposed without CORS protection
**Risk:** Unauthorized access if deployed publicly
**Fix:** Add Next.js middleware with CORS headers

### P0-008: No Input Sanitization ⚠️

**Status:** OPEN
**Files:** API routes
**Issue:** Database/environment names not validated for injection
**Risk:** Potential injection attacks
**Fix:** Add input validation middleware

---

## 🟡 HIGH (P1) - Performance & User Experience

### P1-001: No Query Cancellation

**Issue:** Long-running queries cannot be stopped
**Impact:** Users forced to refresh page, poor UX
**Fix:** Implement AbortController + pg_cancel_backend API

### P1-002: No Query History

**Issue:** Queries lost on tab switch/refresh
**Impact:** Major productivity loss
**Fix:** Add localStorage-based query history

### P1-003: No Saved Queries/Snippets

**Issue:** Cannot save frequently-used queries
**Impact:** Repetitive typing, productivity loss
**Fix:** Add query library with local storage

### P1-004: Virtual Scrolling Overscan Too Low

**File:** `components/ResultsTable.tsx` line 29
**Issue:** OVERSCAN = 5, should be 10-20 for smooth scrolling
**Impact:** Janky scrolling on large result sets
**Fix:** Increase to 15

### P1-005: No Pagination UI

**Issue:** Results truncated at 10K but no way to see more
**Impact:** Cannot view full datasets
**Fix:** Add cursor-based pagination

### P1-006: No Query EXPLAIN/ANALYZE

**Issue:** No performance analysis tools
**Impact:** Cannot optimize slow queries
**Fix:** Add EXPLAIN button

### P1-007: No Table Indexes Shown

**Issue:** Schema viewer missing indexes
**Impact:** Cannot understand query performance
**Fix:** Query pg_indexes and display

### P1-008: No Foreign Keys Shown

**Issue:** Schema viewer missing relationships
**Impact:** Cannot understand data model
**Fix:** Query information_schema.key_column_usage

### P1-009: Keyboard Shortcuts Incomplete

**File:** `components/KeyboardHelp.tsx`
**Issue:** ⌘T and ⌘W documented but not implemented
**Impact:** Advertised features don't work
**Fix:** Implement or remove from help

### P1-010: No Database Refresh Button

**Issue:** Must switch environments to refresh database list
**Impact:** Poor UX when databases are created/dropped
**Fix:** Add refresh icon to database dropdown

---

## 🟢 MEDIUM (P2) - UI/UX Polish

### P2-001: No Schema Refresh

**Issue:** Tables don't update after DDL operations
**Fix:** Add refresh button to DatabaseTree

### P2-002: No Confirmation for Prod Writes

**Issue:** Dangerous writes in UAT/prod have no confirmation
**Fix:** Add warning modal for write queries in prod envs

### P2-003: No Row Editing

**Issue:** Cannot edit data inline
**Fix:** Add editable table cells (future feature)

### P2-004: Limited Export Formats

**Issue:** Only CSV/JSON, no Excel/SQL
**Fix:** Add more export formats

### P2-005: No Theme Toggle

**Issue:** Forced dark mode
**Fix:** Add light mode option

### P2-006: No Font Size Control

**Issue:** Fixed 12px, hard to read for some users
**Fix:** Add font size selector

### P2-007: No Column Sorting

**Issue:** Results cannot be sorted client-side
**Fix:** Add column header click to sort

### P2-008: No Column Filtering

**Issue:** Cannot filter results (must use WHERE)
**Fix:** Add filter input per column

### P2-009: No SQL Formatting

**Issue:** Messy SQL stays messy
**Fix:** Add format button (sql-formatter library)

### P2-010: Better Syntax Error Highlighting

**Issue:** Monaco has generic SQL, not PostgreSQL-specific
**Fix:** Add PostgreSQL validation

### P2-011: Limited Autocomplete

**Issue:** Only shows tables/columns from current DB
**Fix:** Add SQL keywords, functions, snippets

### P2-012: No Table Row Counts

**Issue:** Schema shows tables but not sizes
**Fix:** Query pg_class.reltuples

### P2-013: Empty ActivityBar Buttons

**Issue:** History and Settings do nothing
**Fix:** Implement or hide

### P2-014: No Connection Health Check

**Issue:** Always shows "Connected" even if DB down
**Fix:** Add periodic health check ping

### P2-015: No Session Management

**Issue:** Cannot see active queries or connections
**Fix:** Add sessions view with pg_stat_activity

### P2-016: No Column Resizing

**Issue:** Wide columns cut off, narrow columns waste space
**Fix:** Add draggable column resize

### P2-017: No Multi-tab Persistence

**Issue:** Tabs lost on refresh
**Fix:** Save tabs to localStorage

---

## ⚪ LOW (P3) - Nice to Have

### P3-001: No Multi-Select in Results

**Issue:** Can only copy single cells
**Fix:** Add range selection

### P3-002: No Result Comparison

**Issue:** Cannot diff two query results
**Fix:** Add comparison view

### P3-003: No Visual Query Builder

**Issue:** Must write SQL by hand
**Fix:** Add drag-and-drop query builder

### P3-004: No Data Visualization

**Issue:** No charts/graphs for numeric data
**Fix:** Add Chart.js integration

### P3-005: No Database Diagram

**Issue:** No ERD view of schema
**Fix:** Add visual schema diagram

### P3-006: No Query Templates

**Issue:** Common patterns need to be rewritten
**Fix:** Add template library (SELECT \*, JOIN, etc.)

### P3-007: No Collaborative Features

**Issue:** Cannot share queries with team
**Fix:** Add share link generation

### P3-008: No Query Scheduling

**Issue:** Cannot run queries on schedule
**Fix:** Add cron-like scheduler

---

## Recommended Fixes (Priority Order)

### Immediate (Today)

1. ✅ Fix P0-001: SQL injection in tables route
2. ✅ Fix P0-005: Remove .env files from git
3. ✅ Fix P0-002: Add environment validation
4. ✅ Fix P0-003: Add query timeout
5. ✅ Fix P1-004: Increase virtual scroll overscan

### Short Term (This Week)

6. ⬜ Fix P0-004: Global pool management
7. ⬜ Fix P0-006: Add error boundaries
8. ⬜ Fix P1-001: Query cancellation
9. ⬜ Fix P1-002: Query history
10. ⬜ Fix P1-009: Complete keyboard shortcuts

### Medium Term (This Month)

11. ⬜ Fix P1-006: Query EXPLAIN
12. ⬜ Fix P1-007: Show indexes
13. ⬜ Fix P1-008: Show foreign keys
14. ⬜ Fix P2-002: Prod write confirmation
15. ⬜ Fix P2-012: Table row counts

---

## UI/UX Improvements Summary

### Current State: ⭐ 7/10

**Strengths:**

- ✅ Clean, minimal design
- ✅ Fast virtual scrolling
- ✅ Environment-aware coloring
- ✅ Keyboard shortcuts help
- ✅ Empty states
- ✅ Good error handling in UI

**Weaknesses:**

- ❌ Limited data manipulation
- ❌ No query history/saved queries
- ❌ Missing schema metadata (indexes, FKs)
- ❌ No query analysis tools
- ❌ Limited export options
- ❌ Some advertised features not implemented

### Target State: ⭐ 9/10

All P0/P1 issues resolved, most P2 complete

---

## 📚 Related Documents

**[FEATURES_ROADMAP.md](FEATURES_ROADMAP.md)** - Comprehensive feature wishlist from senior analyst perspective

- Top 5 must-haves: Smart autocomplete, query cancellation, powerful grid, query history, prod safety
- 18 detailed features prioritized by impact
- Implementation timeline and success metrics
- Role-specific priorities (analyst, engineer, DevOps)
