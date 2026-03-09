# pgLite

A minimal full-stack PostgreSQL web admin tool built with Next.js (App Router), TypeScript, and TailwindCSS.

## Features

- **SQL Editor** – Write and execute SQL queries with syntax highlighting via a clean textarea
- **Results Table** – Dynamically rendered table with column headers and row data
- **Multi-Environment Support** – Switch between Loadtest, Sandbox, Staging, VegaPay UAT, Unity UAT, and Development environments
- **Environment Selector** – Visual dropdown to switch database environments instantly with VPN indicators
- **Error Handling** – Clear error messages for query failures
- **Row Count** – Displays number of rows returned
- **Keyboard Shortcut** – `Ctrl+Enter` / `⌘+Enter` to run queries
- **Schema Explorer** – Sidebar placeholder for future schema browsing
- **Dark Mode** – Developer-friendly dark UI

## Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [node-postgres (pg)](https://node-postgres.com/) with connection pooling

## Getting Started

1. **Clone & install dependencies:**

    ```bash
    npm install
    ```

2. **Configure environment variables:**

    The application supports multiple environments (Loadtest, Sandbox, Staging, VegaPay UAT, Unity UAT, Development).

    **Setup Steps:**

    a. Copy the example environment file:

    ```bash
    cp .env.local.example .env.local
    ```

    b. Edit `.env.local` and fill in your actual credentials for each environment:

    ```env
    # All 7 environments are configured with namespaced variables
    # Example format:
    LOADTEST_HOST=your-host.database.azure.com
    LOADTEST_PORT=5432
    LOADTEST_USER=postgres
    LOADTEST_PASSWORD=your_password
    LOADTEST_DB=support
    # ... repeat for SANDBOX_, STAGING_, VEGAPAY_UAT_SNAPSHOT_, etc.
    ```

    c. **Security Note:** `.env.local` is excluded from version control. Never commit credentials!

    d. Configured environments:
    - **Loadtest Azure** - Load testing environment (no VPN)
    - **Sandbox** - Sandbox environment (no VPN)
    - **Staging** - Staging environment (no VPN)
    - **VegaPay UAT Snapshot** - Snapshot database 🔒 (requires VPN)
    - **VegaPay UAT** - UAT environment 🔒 (requires VPN)
    - **Unity UAT** - Unity environment 🔒 (requires VPN)
    - **Development** - Local development

    **Note:** VPN-required environments 🔒 need an active VPN connection to work.

    ```bash
    npm run dev
    ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Security Hygiene

- Never commit real credentials or DSNs to tracked files.
- Use `.env.local` (ignored by git) for local secrets.
- `dbDetails.txt` is sanitized and safe-to-commit only.
- Use `dbDetails.local.example.txt` as template and keep real values in `dbDetails.local.txt`.

## Credentials Source

pgLite now supports loading environment credentials from a local file:

- Path: `.pgconsole/credentials.json`
- Structure reference: `credentials.example.json`
- Full format details: `docs/CREDENTIALS_FILE_FORMAT.md`

Environment loading order:

1. `.pgconsole/credentials.json` (or `PGLITE_CREDENTIALS_FILE`)
2. `PGLITE_ENVIRONMENTS_JSON`
3. Legacy env variables (`LOADTEST_*`, `SANDBOX_*`, etc.)

## API

### `POST /api/query`

Executes a SQL query and returns results.

**Request body:**

```json
{ "query": "SELECT version();" }
```

**Success response:**

```json
{
  "rows": [...],
  "rowCount": 1,
  "fields": ["version"]
}
```

**Error response:**

```json
{ "error": "relation \"foo\" does not exist" }
```
