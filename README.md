# pgLite

A minimal full-stack PostgreSQL web admin tool built with Next.js (App Router), TypeScript, and TailwindCSS.

## Features

- **SQL Editor** – Write and execute SQL queries with syntax highlighting via a clean textarea
- **Results Table** – Dynamically rendered table with column headers and row data
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

   Copy `.env.local.example` to `.env.local` and fill in your database credentials:

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

3. **Run the development server:**

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

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
