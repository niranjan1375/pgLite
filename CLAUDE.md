# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# pgLite — Claude Code Guide

## Project Overview

pgLite is a minimal, full-stack PostgreSQL web admin tool built for engineers and analysts. It provides a modern SQL execution interface with multi-environment support, query history, saved queries, workspace mode (cross-database queries), and SQL templates with variable substitution.

## Tech Stack

- **Frontend:** React 19, Next.js 16 (App Router), TypeScript, TailwindCSS 4
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Database:** PostgreSQL via `node-postgres` (pg v8) with connection pooling
- **SQL Formatting:** `sql-formatter`
- **Build/Lint:** Next.js built-in, ESLint 9

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main UI — monolithic 2000+ line component, all application state lives here |
| `app/api/query/route.ts` | Execute SQL queries (30s timeout, 10K row limit) |
| `app/api/workspace-query/route.ts` | Cross-database queries using `db.table` prefix syntax |
| `app/api/workspace-schemas/route.ts` | Fetch all schemas/tables/columns for autocomplete |
| `app/api/table-data/route.ts` | Paginated table viewer with server-side sort |
| `app/api/columns/route.ts` | Column metadata including primary keys |
| `app/api/tables/route.ts` | List tables per database (5m in-memory cache) |
| `app/api/ping/route.ts` | Health check / latency measurement |
| `lib/db.ts` | Pool creation — fresh pool per request, no singleton |
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
npm run dev      # Start dev server on http://localhost:6500
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured in this project.

## Database Configuration

Credentials are loaded in priority order:
1. `.pgconsole/credentials.json` (preferred)
2. `PGLITE_ENVIRONMENTS_JSON` environment variable
3. Legacy per-environment env vars

Copy `.env.local.example` → `.env.local` and/or `credentials.example.json` → `.pgconsole/credentials.json`.

## Environments

Seven environments configured: `loadtest`, `sandbox`, `staging`, `vegapay-uat-snapshot`, `vegapay-uat`, `unity-uat`, `dev`. Some require VPN. Each has color-coding in the UI.

## Architecture Notes

- **Connection pooling:** `createPool()` in `lib/db.ts` creates a fresh pool per request (max 10 connections, 30s idle timeout, SSL enabled). Always close in `finally`.
- **Caching:** Schema/table/column metadata cached in-memory (5–60s TTL). Pass `forceRefresh=true` to bypass.
- **Template variables:** `@varName = value` syntax at top of SQL, substituted server-side before execution.
- **Workspace mode:** Prefix queries with `dbname.` to route to a specific database; regex-extracts DB name and switches pool.
- **Safety:** Read-only toggle blocks writes **in standard mode only** (`/api/query`) — `/api/workspace-query` currently has NO write protection (known gap G3). Production writes require a confirmation dialog. Row limit is 10K: large result sets are **truncated and flagged** (`truncated`/`totalRows`), not rejected.
- **Virtual scrolling:** `ResultsTable` renders only visible rows; overscan = 15 rows.
- **Dynamic imports:** `SQLEditor` and `QueryTabs` are lazy-loaded (Monaco requires CSR).

## Current State & Findings

See **`docs/REPO_FINDINGS.md`** for the verified codebase map, real issue
statuses, gaps, and the next-task backlog (snapshot 2026-06-26, branch
`feat/v2-wip`).

- **The `issues/` tracker is stale.** Re-verified against code: P0-003 (timeout),
  P0-005 (workspace pool leak), P1-005 (workspace row cap), and P2-002 (EXPLAIN
  UI) are all **already fixed** despite being marked Open there.
- **Still genuinely open:** P0-004 (no API auth), P0-006 (TLS verify disabled),
  P2-003 / workspace write protection (gap G3), P1-003 (query cancellation),
  P1-004 (rate limiting), P1-002 (observability).
- **Dead code:** `components/EnvironmentSelector.tsx` is unused (superseded by
  `EnvironmentStrip.tsx`).

## Code Style

- Brutalist dark UI — monospace fonts, electric green accents, sharp edges, no softness
- All design tokens (colors, spacing, typography, layout dimensions) live in `lib/design-system.ts` — use these constants rather than hardcoding values
- TypeScript throughout — avoid `any`
- Tailwind for styling — no CSS modules
- API routes follow Next.js App Router convention (`route.ts` with named exports `GET`/`POST`)
- No ORM — raw SQL via `pg` client
