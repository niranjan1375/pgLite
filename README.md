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

    **Option A - Quick Start (Single Environment):**

    Copy `.env.local.example` to `.env.local` for basic setup:

    ```bash
    cp .env.local.example .env.local
    ```

    ```env
    POSTGRES_HOST=localhost
    POSTGRES_PORT=5432
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=your_password
    POSTGRES_DB=postgres
    ```

    **Option B - Multi-Environment Setup:**

    All environments are pre-configured in `lib/environments.ts`:
    - **Loadtest Azure** - Load testing environment (no VPN)
    - **Sandbox** - Sandbox environment (no VPN)
    - **Staging** - Staging environment (no VPN)
    - **VegaPay UAT Snapshot** - Snapshot database 🔒 (requires VPN)
    - **VegaPay UAT** - UAT environment 🔒 (requires VPN)
    - **Unity UAT** - Unity environment 🔒 (requires VPN)
    - **Development** - Local development

    You can also create individual `.env.{environment}` files for each environment.

    📖 See [Multi-Environment Configuration Guide](docs/MULTI_ENVIRONMENT.md) for detailed setup.

    **Note:** VPN-required environments 🔒 need an active VPN connection to work.

    ```bash
    npm run dev
    ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

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
