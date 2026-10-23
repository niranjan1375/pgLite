# pgLite

A fast, local PostgreSQL console for day-to-day DB work across several
environments. Next.js (App Router), TypeScript, Tailwind, `node-postgres`.

pgLite is a **single-user tool that runs on your own machine** — the server
binds `127.0.0.1:6500` and has no login. Don't expose it on a network.

## Features

- **Monaco SQL editor** with schema-aware autocomplete, multiple tabs and `⌘+Enter` to run
- **Multi-environment** — switch env and database per tab; VPN-only envs are marked
- **Workspace tabs** — query across databases with `dbname.table` prefixes
- **Results grid** — virtual scrolling, type-aware sort, CSV export; 10K-row cap (truncated and flagged, never loaded whole)
- **Table viewer** — paginated, server-side sort, delete a row by primary key
- **Safety** — new tabs are read-only, enforced by Postgres; writes to protected envs (prod/UAT/staging) ask for confirmation; 30s statement timeout; cancel a running query
- **EXPLAIN view**, query history, saved queries, Context variables and SQL templates (`@var = value`)

## Getting started

```bash
npm install
cp credentials.example.json .pgconsole/credentials.json   # then fill in real values
npm run dev                                               # http://127.0.0.1:6500
```

Other commands: `npm run build`, `npm run lint`, `npm test` (vitest).

## Credentials

Environments load from the first source that exists:

1. `.pgconsole/credentials.json` (or the path in `PGLITE_CREDENTIALS_FILE`) — preferred
2. `PGLITE_ENVIRONMENTS_JSON`
3. Legacy per-env variables (`LOADTEST_*`, `SANDBOX_*`, …) in `.env.local`

Format, including the per-environment `ssl` mode and CA bundle:
`docs/CREDENTIALS_FILE_FORMAT.md`. An environment is **protected** (writes need
confirmation) when it sets `"production": true`, or its id contains
`prod`/`uat`/`staging`, or its host contains `prod`.

## Security hygiene

- `.pgconsole/` and `.env*` (except `.env.local.example`) are gitignored — never commit real credentials.
- `dbDetails.txt` is sanitized and safe to commit; keep real values in `dbDetails.local.txt`.

## Project status

Concluded 2026-10-24. All tracked issues are fixed or explicitly out of scope
for a local single-user tool — see `issues/README.md`. New work only if it
makes daily DB work faster or safer.
