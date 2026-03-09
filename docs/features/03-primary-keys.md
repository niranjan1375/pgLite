Feature: Include Primary Key metadata in schema payloads

Summary

Return primary-key column information for every table in the workspace and standard schema endpoints so the client can safely build deletes, show PK badges, and surface safer UX when editing rows.

Motivation

- Current delete generation builds a WHERE using all columns which can be unsafe and verbose.
- Knowing the primary key (PK) enables precise and efficient row identification, safer delete UI, and nicer UX (PK badges, prioritized autocomplete, composite PK handling).

Design

API

- Endpoint(s) to extend: `/api/columns` (single DB) and `/api/workspace-schemas` (workspace-mode aggregation).
- For each table object returned include `primaryKeys?: string[]` (ordered by ordinal_position) alongside `columns`.

Example table shape

{
name: string,
columns: Column[],
primaryKeys?: string[],
}

How to fetch (Postgres)

- information_schema approach (easy to read):

    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
    AND tc.table_name = kcu.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = $1
    AND tc.table_name = $2
    ORDER BY kcu.ordinal_position;

- pg_catalog approach (more direct, faster for many tables):

    SELECT a.attname
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(i.indkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = cols.attnum
    WHERE i.indisprimary
    AND n.nspname = $1
    AND c.relname = $2
    ORDER BY cols.ord;

Server behaviour

- When assembling `table` objects, include `primaryKeys` based on the SQL above.
- Avoid extra round-trips: fetch PKs as part of the same query phase that enumerates tables/columns if possible.
- Respect `&refresh=1` and server-side caching.

Frontend

- When converting API response into `workspaceSchemas` / `tableColumns`, attach `primaryKeys` to each table and mark `columns` with `isPrimary: boolean` where relevant.
- Update `handleDeleteRow` delete-builder to prefer PKs:
    - If a table has `primaryKeys` and the row contains non-null values for all PK columns => build WHERE using only PK columns.
    - Else fall back to the current full-row WHERE.
- Show PK badges in the DatabaseTree and column lists (optional visual tweak).

Acceptance criteria

- API responses for `/api/columns` and `/api/workspace-schemas` include `primaryKeys` per table (when PK exists).
- UI uses PKs to build DELETE queries when available (resulting SQL should use PK columns only).
- Delete behaviour unchanged when no PK exists (fallback still works).
- Tests or manual verification show correct PK ordering for composite keys.

Performance & rollout notes

- Gathering PKs across many databases may add latency; server-side caching is recommended (already present for workspace-schemas).
- If fetching all PKs causes slow response times in workspace mode, consider lazy-loading PKs on demand (e.g., when the user opens a table or clicks delete).

Follow-ups

- Add small UI cue (badge) next to primary key columns in the column list.
- Consider an admin setting to toggle eager vs lazy PK collection in workspace mode.

References

- Postgres information_schema and pg_catalog docs

--
Created: automated feature doc (requested by developer).
