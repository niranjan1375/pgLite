Title: Add primary-key metadata to schema endpoints

Description

Add `primaryKeys` to the table objects returned by `/api/columns` and `/api/workspace-schemas` so the frontend can build safer DELETE statements and surface PK metadata in the UI.

Why

- Current delete generation builds WHERE using all columns which is error-prone and may lead to incorrect deletes for floating or duplicated rows.
- Primary keys provide the authoritative, minimal set of columns to uniquely identify rows.

Acceptance criteria

- API responses include `primaryKeys: string[]` (optional, present only when PK exists) for each table.
- Frontend uses PKs for delete queries when available (fallback to full-row WHERE otherwise).
- Tests or manual checks verify composite PK ordering is preserved.

Implementation notes

- Server: extend `table` shape to include `primaryKeys` and fetch PK columns via information_schema or pg_catalog.
- Client: when converting API response to internal `tableColumns`, annotate columns with `isPrimary` and prefer PKs in `handleDeleteRow`.

Steps

1. Update server route `/app/api/columns` to include PKs.
2. Update server route `/app/api/workspace-schemas` to include PKs for each table returned.
3. Update TypeScript types for `Table`/`WorkspaceSchema`.
4. Update frontend delete-builder and optionally add PK badges in UI.
5. Add tests or manual verification notes.

Labels: enhancement, backend, frontend, workspace

Assignee: (none)

Notes

- If workspace-mode performance becomes an issue, switch to lazy loading PKs per table and cache results.

--
Issue drafted by automation; adapt language before opening on GitHub.
