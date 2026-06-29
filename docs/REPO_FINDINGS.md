# pgLite — Repository Findings & Current State

> Snapshot: 2026-06-26 · branch `feat/v2-wip` · ~10K lines TS/TSX
> Purpose: a verified, single-source-of-truth map of the codebase and the
> real status of tracked issues, so we can pick next tasks confidently.
> **The `issues/` tracker is stale** (written ~2026-03); statuses below were
> re-verified against current code.

---

## 1. Architecture at a glance

Vertical UI: ActivityBar → EnvironmentStrip → QueryTabs → (SQLEditor + DatabaseTree) → ResultsTable → StatusBar.

- **`app/page.tsx` (~1988 lines)** — monolithic root. Holds ALL global state:
  `result`, `explainResult`, `error`, `loading`, `executionTime`, `activeTab`,
  `showProdWarning`/`pendingQuery`, schema caches, history, saved queries,
  table-viewer state, connectivity. Heavy use of `useRef` for caches +
  in-flight request dedup (`databasesCacheRef`, `workspaceSchemasCacheRef`,
  `tableColumnsCacheRef`, `*InFlightRef`).
- **Per-tab state lives in `components/QueryTabs.tsx`** (not page.tsx),
  persisted to localStorage. Each `QueryTab` = `{id, name, query, environment,
  database, readOnly, mode: "standard"|"workspace", templateName}`. Parent
  drives tabs imperatively through a `QueryTabsRef` (updateQuery,
  updateTabEnvironment, openWorkspaceTab, …).
- **Two execution modes:**
  | | standard | workspace |
  |---|---|---|
  | endpoint | `/api/query` | `/api/workspace-query` |
  | scope | one DB (explicit) | multi-DB, auto-routed by `db.table` prefix |
  | variables (`@v = x`) | no | yes (substituted server-side) |
  | default timeout | 30s | 120s (both cap at 300s) |
  | read-only enforced | **yes** | **NO** (see Gap G3) |

### Query execution flow
`⌘↵` / Run → `SQLEditor.triggerRun` (300ms debounce, statement-at-cursor or
selection) → `page.tsx` onRunQuery → workspace path extracts/validates vars →
`runQuery()` (prod-write guard → confirm modal) → `executeQuery()` picks
endpoint, POSTs, appends history, `startTransition(setResult/setError/setExplain)`.

### Key backend facts
- **`lib/db.ts`**: fresh `Pool` per request (`max:10`, idle 30s, connect 5s,
  `ssl.rejectUnauthorized:false`). No singleton. All routes close in `finally`.
- **`lib/environments.ts`**: load priority `credentials.json` → `PGLITE_ENVIRONMENTS_JSON`
  → legacy env vars. 7 envs, color-coded, `requiresVPN` flags.
- **`lib/templates.ts`**: `@name = value`, stored in `.pgconsole/templates/*.sql`.
  Substitution escapes `'`→`''`; numerics/NULL/TRUE/FALSE inserted unquoted.
  Path-traversal guarded.
- **Caching TTLs:** tables/columns 5min, workspace-schemas 60s (+ HTTP
  `s-maxage`). All in-memory `Map`s — **unbounded** (see Gap G7).

---

## 2. Tracked issues — VERIFIED current status

Re-checked against code on 2026-06-26. ✅ = fixed in code, ⛔ = still open.

| ID | Title | Tracker says | **Actual** | Evidence |
|----|-------|--------------|-----------|----------|
| P0-001 | Hardcoded credentials | Fixed | ✅ Fixed | `lib/environments.ts` loader |
| P0-002 | Unlimited results | Fixed | ✅ Fixed (+ reject→truncate 2026-06-26) | `query/route.ts:124` |
| P0-003 | No query timeout | **Open** | ✅ **Fixed** | `query/route.ts:98` `set_config('statement_timeout')`, both routes |
| P0-004 | No API auth | Open | ⛔ Open | no `middleware.ts`, no auth in routes |
| P0-005 | Workspace pool leak | **Open** | ✅ **Fixed** | `workspace-query/route.ts:344` `pool.end()` + `:311` release + `:229` tempPool |
| P0-006 | TLS verify disabled | Open | ⛔ Open | `db.ts` `rejectUnauthorized:false` |
| P1-001 | Pool-per-request | Open | ⛔ Open (by design) | `db.ts` fresh pool each call |
| P1-002 | No observability | Open | ⛔ Open | no structured logging |
| P1-003 | No query cancellation | Open | ⛔ Open | no `AbortController` / `pg_cancel_backend` |
| P1-004 | No rate limiting | Open | ⛔ Open | — |
| P1-005 | Workspace result cap | **Open** | ✅ **Fixed** | `workspace-query/route.ts:287` truncate |
| P1-006 | Debug log sanitization | Open | ◐ Mostly | password length/prefix logging removed in v2; verify no remaining leaks |
| P1-007 | Static env registry | Open | ⛔ Open (eased by credentials.json) | — |
| P2-001 | Cursor streaming | Open | ⛔ Open (deferred — decision in issue file) | — |
| P2-002 | EXPLAIN UI | Open | ✅ **Fixed** | `components/ExplainView.tsx` exists & wired |
| P2-003 | Frontend-only read protection | Open | ⛔ Open | regex-based; workspace mode has none |

**Net: 5 issues marked Open are actually fixed (P0-003, P0-005, P1-005, P2-002, partly P1-006).** The `issues/` files and `issues/README.md` should be updated to match.

---

## 3. Real current gaps & bugs (verified)

- **G1 — No authentication (P0-004).** Every API route executes arbitrary SQL
  unauthenticated. Biggest blocker for any non-localhost deployment.
- **G2 — TLS verification off (P0-006).** `rejectUnauthorized:false` in `db.ts`
  → MITM exposure. Should be per-env configurable.
- **G3 — Read-only toggle does NOT protect workspace mode.** `/api/query`
  enforces `isWriteQuery` + `readOnly`; **`/api/workspace-query` has no
  `readOnly` param or write check at all.** A user in workspace mode can run
  INSERT/UPDATE/DELETE even with the RO toggle on. This is a live correctness/
  safety bug, not just future work.
- **G4 — No query cancellation (P1-003).** Frontend has no `AbortController`;
  in-flight fetches aren't cancelled on tab switch/unmount → orphaned promises,
  state-on-unmounted warnings. No server-side cancel.
- **G5 — Silent schema-fetch failures.** `fetchTablesAndColumns` (page.tsx) logs
  and clears spinner on error with no user-visible message → autocomplete
  silently empty.
- **G6 — Fragile table detection.** `extractTableFromQuery` regex (page.tsx)
  misses aliases/CTEs → row-delete button silently disappears for complex SQL.
- **G7 — Unbounded in-memory caches.** tables/columns/workspace-schemas `Map`s
  never evict → slow memory growth across many env/db combos.
- **G8 — DB-side memory unbounded on large reads (P2-001).** Truncation happens
  after full materialization. Deferred; use `pg-cursor` when it bites.

## 4. Dead code / cleanup (verified)

- **`components/EnvironmentSelector.tsx` (164 lines) — DEAD.** No imports
  anywhere; superseded by `EnvironmentStrip.tsx`. Safe to delete.
- **`components/EmptyState.tsx`** — `icon` prop declared but never rendered.
- **`icons/RefereshIcon.tsx`** — filename typo ("Referesh").
- **Search inputs** in `DatabaseTree` and `QueryHistory` re-filter on every
  keystroke (no debounce).
- **No row-edit UI** in `ResultsTable` despite `readOnly`/delete plumbing.

## 5. Doc hygiene

- `docs/` and `issues/` were written ~2026-03 and have drifted from v2 code
  (see §2). `docs/CHATGPT_RESPONSE.md` is a stale transcript — archive candidate.
- `dbDetails.txt` is a tracked **placeholder** (not secrets — verified).
  Local `.env.*` (prod/loadtest/…) are correctly gitignored.

---

## 6. Suggested next-task backlog (priority order)

1. **G3 — workspace-query write protection** (small, real safety bug; mirror
   `isWriteQuery`+`readOnly` from `query/route.ts`).
2. **Sync the `issues/` tracker** to verified statuses in §2 (quick, prevents
   future confusion).
3. **G1 — API auth (P0-004)** — the true ship blocker if this ever leaves localhost.
4. **G2 — TLS config (P0-006)** — per-env `rejectUnauthorized`.
5. **G4 — query cancellation (P1-003)** — `AbortController` + cancel button;
   optional `pg_cancel_backend`.
6. **Cleanup pass** — delete `EnvironmentSelector.tsx`, fix `EmptyState.icon`,
   rename `RefereshIcon`, debounce tree/history search.
7. **G7 — bound caches** (LRU/size cap). **G5/G6** — surface schema errors,
   harden table-detection regex.
8. Deferred: **G8/P2-001** cursor streaming, **P1-004** rate limiting,
   **P1-002** observability, **P1-007** dynamic env registry.
