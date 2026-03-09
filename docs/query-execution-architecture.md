SQL Console Query Execution Architecture
Purpose

This document defines the backend and frontend architecture for executing SQL queries safely and efficiently across multiple database connections.

Goals:

Prevent cross-connection query contamination

Support multiple environments and databases

Allow long-running queries without blocking UI

Enable query cancellation

Provide a responsive user experience

1. System Overview

Current tool features:

Query Mode
Investigation Mode
Table Browser
Multiple DB Connections
Result Grid

To support these reliably, the system uses:

Async Query Jobs
Connection Pool Manager
Result Streaming / Pagination

Architecture:

Browser
↓
API Layer
↓
Query Job Manager
↓
Connection Pool Manager
↓
Database 2. Connection Management
Problem

Using a single shared database client causes:

query mixing
wrong database results
dangerous updates
race conditions
Solution

Each connection must have its own connection pool.

Connection Storage

Connections stored locally:

.pgconsole/connections.json

Example:

{
"connections": [
{
"id": "sandbox-account",
"host": "sandbox-db.company.com",
"port": 5432,
"database": "account",
"environment": "sandbox"
},
{
"id": "prod-account-us",
"host": "prod-us.company.com",
"port": 5432,
"database": "account",
"environment": "prod"
}
]
}

Passwords are NOT stored here.

Credentials should come from:

environment variables
or secret manager 3. Connection Pool Manager

Backend maintains a pool per connection.

Example implementation:

const pools = {}

function getPool(connectionId) {
if (!pools[connectionId]) {
pools[connectionId] = new Pool(getConnectionConfig(connectionId))
}

return pools[connectionId]
}

Query execution:

async function executeQuery(connectionId, sql) {
const pool = getPool(connectionId)
return pool.query(sql)
}

Benefits:

safe isolation
parallel queries
connection reuse 4. Async Query Job System
Problem

Long queries block the UI.

Example:

SELECT \* FROM ledger

may take several seconds.

Solution

Use query jobs.

4.1 Start Query

Endpoint:

POST /query/start

Request:

{
"connection_id": "sandbox-account",
"sql": "SELECT \* FROM ledger"
}

Response:

{
"job_id": "job_123"
}

Query runs in background.

4.2 Query Status

Endpoint:

GET /query/status/{job_id}

Response:

{
"status": "running"
}

or

{
"status": "complete"
}

or

{
"status": "error"
}
4.3 Query Results

Endpoint:

GET /query/result/{job_id}

Response:

{
"rows": [],
"fields": [],
"rowCount": 0
} 5. Query Cancellation

Endpoint:

POST /query/cancel/{job_id}

Backend implementation:

pg_cancel_backend()

This allows stopping expensive queries.

6. Result Handling

Large result sets must not freeze the UI.

Frontend uses:

virtualized table
incremental rendering

Backend uses:

LIMIT
pagination

Example:

SELECT \* FROM table
LIMIT 1000 OFFSET 0 7. Table Browser Queries

Clicking a table automatically runs:

SELECT \* FROM schema.table
LIMIT 1000

Features:

pagination
column sorting
column filtering
cell editing

Sorting example:

SELECT \*
FROM table
ORDER BY created_at DESC
LIMIT 1000

Filtering example:

SELECT \*
FROM table
WHERE status = 'OPEN'
LIMIT 1000 8. Safe Editing

Editing cells generates SQL automatically.

Example edit:

status → CLOSED

Generated query:

UPDATE billing.bill
SET status = 'CLOSED'
WHERE bill_id = 12345

Requires:

primary key detection

Fallback (if no PK):

update using full row match 9. Investigation Mode

Investigation files stored locally:

.pgconsole/investigations/

Example:

account_debug.sql

Content:

-- investigation: account_debug
-- created_at: 2026-03-09

@accountId = 5631772450120464

select \* from account_management.base_account
where account_id=@accountId;

select \* from ledger.ledger
where account_id=@accountId;

Investigations store:

queries
variables
comments

Results are never stored.

10. Templates

Templates stored in:

.pgconsole/templates/

Example:

account_investigation.sql

Variables remain empty:

@accountId =

Templates can be reused.

11. Frontend Query Context

Every query must include:

connection_id
database
mode

Example request:

{
"connection_id": "sandbox-account",
"sql": "SELECT \* FROM ledger"
}

This prevents cross-database query errors.

12. Safety Features

Production connections should be marked.

Example:

environment: prod

UI should display:

RED indicator
confirmation for destructive queries

Optional confirmation:

type connection name before execution 13. Future Enhancements

Planned improvements:

bulk updates
query history
entity tracing
investigation pipelines
query streaming
schema graph explorer

These features build on the architecture defined above.

14. Key Design Principles

The tool must prioritize:

stability
query safety
connection isolation
fast UI feedback

The tool should always remain usable as a daily driver SQL console.

If you want, I can also give you a second document that defines the full frontend architecture (editor, tabs, investigation mode, result grid, table view) so your repo has a clean system design from the start.
