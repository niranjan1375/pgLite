# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# pgLite — Claude Code Guide

## Project Overview

pgLite is a minimal, full-stack PostgreSQL web admin tool built for engineers and analysts. It provides a modern SQL execution interface with multi-environment support, query history, saved queries, workspace mode (cross-database queries), and SQL templates with variable substitution.

## Principles

- **Fast and lean beats feature-rich.** Every change should make day-to-day
  DB work quicker or safer. Don't add features (or dependencies) that don't
  clearly pay for themselves; a big feature list that slows the tool down is
  explicitly not wanted.
- Functionality first; UI polish comes later.

## Tech Stack

- **Frontend:** React 19, Next.js 16 (App Router), TypeScript, TailwindCSS 4
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Database:** PostgreSQL via `node-postgres` (pg v8) with connection pooling
- **Build/Lint:** Next.js built-in, ESLint 9

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main UI — layout + wiring (~560 lines); state lives in the hooks below |
| `hooks/useQueryExecution.ts` | Results pane: run (prod-write confirm), cancel, table viewer, PK row delete |
| `hooks/useSchemaMetadata.ts` | Databases per env + tables/columns/PKs for the active tab (TTL cache, stale-response guard) |
| `hooks/useEnvironments.ts` / `useContextProfiles.ts` / `useTemplates.ts` | Env list + production flag; Context variables; workspace templates |
| `hooks/useQueryLibrary.ts` / `useEditorLayout.ts` | History + saved queries (localStorage); editor resize + ⌘B sidebar |
| `lib/query-types.ts` / `lib/sql-literal.ts` | Shared client types; identifier/literal quoting and the PK `DELETE` builder |
| `app/api/query/route.ts` | Execute SQL queries (30s timeout, 10K row limit) |
| `app/api/workspace-query/route.ts` | Cross-database queries using `db.table` prefix syntax |
| `app/api/workspace-schemas/route.ts` | Fetch all schemas/tables/columns for autocomplete |
| `app/api/table-data/route.ts` | Paginated table viewer with server-side sort |
| `app/api/columns/route.ts` | Column metadata including primary keys |
| `app/api/tables/route.ts` | List tables per database (5m in-memory cache) |
| `app/api/ping/route.ts` | Health check / latency measurement |
| `lib/db.ts` | Shared pool per environment + database |
| `lib/tls.ts` | Per-environment TLS mode / CA bundle, certificate-error hint |
| `lib/environments.ts` | Multi-environment config loading (credentials.json → env var → legacy env vars) |
| `lib/templates.ts` | SQL template parsing, variable substitution, file storage |
| `lib/workspace-utils.ts` | Frontend: variable extraction/validation, selection-vs-statement logic |
| `lib/queryStorage.ts` | localStorage persistence for saved queries |
| `lib/design-system.ts` | Central design tokens — colors, typography, spacing, layout constants |
| `components/SQLEditor.tsx` | Monaco wrapper — variable extraction, autocomplete, keyboard shortcuts |
| `components/ResultsTable.tsx` | Virtual-scrolled result grid (MAX 10K rows, client sort disabled >5K) |
| `components/DatabaseTree.tsx` | Schema explorer sidebar (large file ~67KB) |
| `components/QueryTabs.tsx` | Multi-tab query workspace |
| `components/ExplainView.tsx` | EXPLAIN PLAN visualization |
| `components/QueryHistory.tsx` | In-memory query history (max 100) |
| `components/SavedQueries.tsx` | localStorage saved queries with tags/favorites |

## Development Commands

```bash
npm run dev      # Start dev server on http://127.0.0.1:6500 (localhost only)
npm run build    # Production build
npm run lint     # ESLint
npm test         # Vitest — unit tests for pure logic in lib/*.test.ts
```

Tests cover the pure modules (SQL scanner/safety, result formatting,
templates, workspace variables). UI and API routes are verified manually.

## Database Configuration

Credentials are loaded in priority order:
1. `.pgconsole/credentials.json` (preferred)
2. `PGLITE_ENVIRONMENTS_JSON` environment variable
3. Legacy per-environment env vars

Copy `.env.local.example` → `.env.local` and/or `credentials.example.json` → `.pgconsole/credentials.json`.

## Environments

Seven environments configured: `loadtest`, `sandbox`, `staging`, `vegapay-uat-snapshot`, `vegapay-uat`, `unity-uat`, `dev`. Some require VPN. Each has color-coding in the UI.

## Architecture Notes

- **Connection pooling:** `getPool()` in `lib/db.ts` reuses one pool per environment + database (max 10 connections, 30s idle timeout). Never `end()` it.
- **TLS:** per-environment `ssl` (`verify` default for remote hosts, `require`, `disable` default for localhost) and `sslCa` (PEM bundle path, needed for AWS RDS) — `lib/tls.ts`. Certificate failures get a how-to-fix hint appended via the pool's `HintingClient`.
- **Caching:** Schema metadata (`/api/databases`, `/api/columns`, `/api/workspace-schemas`) goes through `lib/schema-cache.ts`: stale-while-revalidate (served at once, refreshed in the background after 10 min), persisted to `.pgconsole/schema-cache/` so it survives restarts, keyed by env + host + db. The client revalidates quietly after 60s; the spinner only shows on an empty cache or the intellisense refresh button (`forceRefresh=true` / `refresh=1`). Workspace schemas load 6 databases in parallel. `/api/tables` still has its own 5-min in-memory cache.
- **Template variables:** `@varName = value` syntax at top of SQL, substituted server-side before execution.
- **Workspace mode:** Prefix queries with `dbname.` to route to a specific database; regex-extracts DB name and switches pool.
- **Safety:** Read-only is enforced by Postgres, not by parsing: `lib/run-query.ts` runs the statement in `BEGIN READ ONLY … ROLLBACK` over the extended protocol (one statement only), in both query routes. EXPLAIN always runs read-only. New tabs default to read-only. `lib/sql-safety.ts` (`scanStatements`, `isWriteQuery`) is a UX heuristic only — it drives the production-write confirm, whose envs come from the `production` flag in `/api/environments`. Unknown environment ids are an error, never a fallback. Row delete is only offered in the table viewer and only by primary key. Row limit is 10K: a single SELECT/WITH/VALUES/TABLE statement is read through `pg-cursor` and stops after 10,001 rows, so an unbounded SELECT never loads the whole table; results are **truncated and flagged** (`truncated`; `totalRows` is omitted when unknown), not rejected. DML responses carry `command` and the affected `rowCount`.
- **Virtual scrolling:** `ResultsTable` renders only visible rows; overscan = 15 rows.
- **Dynamic imports:** `SQLEditor` and `QueryTabs` are lazy-loaded (Monaco requires CSR).

## Current State

**Concluded 2026-10-24** as a local single-user tool. Every tracked issue is
fixed or explicitly out of scope (`issues/README.md`); API auth, query
observability and a dynamic environment registry are deliberately not built
because the server only binds `127.0.0.1`. Older planning docs, audits and
`REPO_FINDINGS.md` are in `docs/archive/` and no longer describe the code.

## Code Style

- Calm Tokyo Night theme — sans-serif chrome, monospace for data and SQL
- All design tokens (colors, spacing, typography, layout dimensions) live in `lib/design-system.ts` — use these constants rather than hardcoding values
- TypeScript throughout — avoid `any`
- Tailwind for styling — no CSS modules
- Element-level resets in `globals.css` go inside `@layer base`. Unlayered CSS beats every Tailwind v4 utility, which once silently zeroed all `p-*`/`m-*`/`ml-auto`/button `text-[..]` classes.
- Production-ness comes from the server (`isProdEnvironment` / the `production` prop), never from the env name.
- API routes follow Next.js App Router convention (`route.ts` with named exports `GET`/`POST`)
- No ORM — raw SQL via `pg` client
