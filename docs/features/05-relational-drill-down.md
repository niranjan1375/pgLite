# PRD: Relational Drill-Down ("Follow the data")

> Status: **Draft / for review** · 2026-06-29 · branch `feat/relational-drill-down`
> Owner: TBD · Surface: results grid (`ResultsTable`), metadata APIs
> Related: [Context feature](04-context.md), [REPO_FINDINGS](../REPO_FINDINGS.md)

---

## 1. TL;DR

Let users **navigate the data graph by clicking**, instead of hand-writing joins.
In the results grid, clicking an id-bearing cell offers two moves:

- **→ Open referenced record** — follow a foreign key outward to its parent row.
- **← Find referencing rows** — from a primary-key value, list and open the
  child rows that point back to it.

Generated queries run in a **new tab**, in the same environment/route, so the
user keeps their place and builds an investigation trail. This turns pgLite from
a query editor into an **investigation tool** — its real job.

---

## 2. Problem & motivation

### The job pgLite is actually used for
Engineers, testers, and debuggers use pgLite to **chase a specific entity across
environments** — a program, client, loan, card, or transaction — to answer
"what is the state of this thing, and why is it broken here?" The existing
investments confirm this is the core job: multi-environment support, workspace
cross-DB routing, and the new Context variables (`@programId`, `@snapmintProgramId`).

### The pain today
Following relationships is manual and repetitive:

1. Run `SELECT * FROM loans WHERE id = @loanId` → see a `customer_id`.
2. **Hand-write** `SELECT * FROM customers WHERE id = <paste the value>`.
3. See a `program_id` → **hand-write** another query.
4. Want to know which transactions reference this loan → **hand-write** a query
   against `transactions WHERE loan_id = …`.

Each hop is a context switch: copy a value, recall the target table and its key,
type a new query. For a debugging session that's dozens of these. The schema
knowledge (which column points where) lives in the engineer's head, not the tool —
even though Postgres already knows it via foreign keys.

### Why now
- The org's schemas **define foreign keys** (confirmed), so the relationships are
  machine-readable.
- pgLite already introspects **primary keys** (`app/api/columns/route.ts`,
  `workspace-schemas`, `table-data`) and renders a capable virtualized grid
  (`ResultsTable`). Drill-down is largely additive on top of existing plumbing.
- It compounds the just-shipped Context feature: Context sets the entry-point
  entity; drill-down walks outward from it.

---

## 3. Users & use cases

| User | Use case |
|------|----------|
| **Debugger (engineer)** | "This loan is stuck. Open its customer, its program config, the last 5 transactions — without writing 4 queries." |
| **Tester** | "I created an entity in UAT; click through to verify every related record got written correctly." |
| **Analyst** | "From this row, what references it? Are there orphaned children?" |

Primary surface: **workspace mode** (where cross-DB routing + Context already
live), but the feature works in standard mode too (single DB).

---

## 4. Goals / Non-goals

### Goals
- One-click navigation along real FK relationships, both directions.
- Generated SQL is **correct and typed** (right quoting, schema/db-qualified).
- Preserve context: drill-down never destroys the user's current query/results.
- Read-only and safe: drill-down only ever generates `SELECT`s.
- Graceful degradation when FK metadata is absent for a column.

### Non-goals (this version)
- A visual ERD / graph canvas (future).
- Editing data via the grid.
- Cross-**database** FKs (Postgres doesn't enforce them; out of scope).
- Multi-hop "expand the whole tree at once" (we do one hop per click; the trail
  emerges from repeated hops).
- Auto-inferring relationships where no FK exists (optional heuristic fallback,
  see §7).

---

## 5. Product experience

### 5.1 The cell menu
Hovering a cell shows a subtle affordance (e.g. a small ⤴ glyph) when that cell
participates in a relationship. Clicking it (or right-click → menu) opens:

```
┌─────────────────────────────────────────────┐
│  customer_id = 88421                          │
│  ─────────────────────────────────────────   │
│  → Open customer (customers.id)               │   ← outbound FK
│  ─────────────────────────────────────────   │
│  ← Find rows referencing this                 │   ← inbound (only on PK cells)
│      transactions.loan_id        (→ run)      │
│      loan_events.loan_id         (→ run)      │
│      repayments.loan_id          (→ run)      │
└─────────────────────────────────────────────┘
```

- **Outbound** (the cell's column is an FK): a single direct action — open the
  parent row.
- **Inbound** (the cell is a PK, or a value other tables reference): a **pick-list**
  of the tables/columns that reference it, each running a child query. Inbound
  can fan out to many tables, so we never auto-run — the user chooses.

### 5.2 Where results open
Generated queries open in a **new query tab**, pre-filled and auto-run, inheriting
the current tab's environment, database, mode, and read-only flag. The originating
tab is untouched. Tab is auto-named for the hop, e.g. `customers · id=88421`.

Rationale: investigation is a walk; you frequently want to go back a step or
compare. A new tab preserves the trail and your place. (Replace-in-place was
considered and rejected — it loses context, the #1 thing investigators need.)

### 5.3 The trail (lightweight, this version)
Because each hop is its own tab, the open tabs *are* the breadcrumb trail. A
richer visual trail/back-stack is a future enhancement (§12).

---

## 6. Detailed design

### 6.1 Foreign-key introspection (the foundation)
Today only PKs are queried. Add FK introspection to the same metadata path. Per
database, for the user-visible schemas, collect:

- **Outbound FKs:** `(table, [columns]) → (ref_table, [ref_columns])`
- **Inbound index (reverse):** `(ref_table) ← [{ table, columns, ref_columns }]`

Query (sketch — joins the standard catalog views):

```sql
SELECT
  tc.table_schema, tc.table_name, tc.constraint_name,
  kcu.column_name, kcu.ordinal_position,
  ccu.table_schema AS ref_schema,
  ccu.table_name   AS ref_table,
  ccu.column_name  AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

> Note: for **composite** FKs we must group by `constraint_name` and order by
> `ordinal_position` so multi-column keys map correctly (mirrors how PKs are
> aggregated today). `constraint_column_usage` is adequate for single-column FKs;
> composite FKs may need `pg_catalog.pg_constraint` (`conkey`/`confkey`) for
> exact column pairing — see Open Question Q4.

Cache alongside PKs (same 5-min TTL, same `forceRefresh`).

### 6.2 Metadata API changes
Extend `app/api/columns/route.ts` (and `workspace-schemas` for the tree) to
return, per table:

```ts
foreignKeys: Array<{
  columns: string[];          // local FK columns
  refSchema: string;
  refTable: string;
  refColumns: string[];       // referenced columns (PK of parent)
  constraintName: string;
}>;
// plus a derived reverse map the frontend can build or the API can precompute:
referencedBy: Array<{ schema: string; table: string; columns: string[]; refColumns: string[] }>;
```

### 6.3 Frontend data + types
Thread FK maps into the page state alongside `primaryKeysByTable`
(`foreignKeysByTable`, `referencedByTable`). `ResultsTable` needs to know, for the
**current result set's table**, the FK/PK metadata — so it must know which table
the results came from. We already derive table info for some queries
(`extractTableFromQuery` in `page.tsx`); drill-down relies on that, and is simply
disabled when the source table can't be determined (e.g. multi-table joins,
aggregates) — see §7.

### 6.4 Grid affordance (`ResultsTable`)
- Compute, per column, whether it is: an **FK column** (outbound) and/or a **PK
  column** (inbound candidate).
- Show the ⤴ affordance only on those cells, only when non-null.
- Menu built from the FK metadata; actions call a new `onDrillDown(payload)`
  callback up to `page.tsx`.

### 6.5 Query generation (typed & safe)
`page.tsx` builds the SQL from a structured payload — **never string-pasting user
values blindly**:

- Outbound: `SELECT * FROM <ref_table> WHERE <ref_col> = <value> LIMIT <n>`
- Inbound: `SELECT * FROM <child_table> WHERE <fk_col> = <value> LIMIT <n>`
- **Typed quoting:** unlike `@var` substitution, here we know the referenced
  column's data type from metadata, so we quote correctly automatically (numeric
  unquoted, text/uuid/date quoted with escaping). This sidesteps the manual-quoting
  problem entirely for generated queries.
- **Qualification:** standard mode → `schema.table`; workspace mode → `db.table`
  (reuse the existing prefix convention so routing works).
- **Composite keys:** `WHERE a = v1 AND b = v2` built from the column/value pairs.
- Always read-only `SELECT` with a `LIMIT` (default 100) — safe by construction.

### 6.6 Navigation
A new `openDrillDownTab(sql, context)` path: create a tab (reuse
`QueryTabsRef.openWorkspaceTab` / new-tab plumbing), set its env/db/mode/readOnly
from the source tab, set the query, and auto-run.

---

## 7. Edge cases & degradation

| Case | Behavior |
|------|----------|
| Source table unknown (joins, aggregates, `SELECT expr`) | No drill-down affordance; feature silently absent (no error). |
| Column has no FK and isn't a PK | No affordance on that cell. |
| Null cell value | Affordance hidden. |
| Composite FK | Generate multi-column `WHERE`; if value pairing is ambiguous, skip with a tooltip. |
| Inbound fan-out to many tables | Pick-list; never auto-run. Cap list length, note if truncated. |
| Self-referencing FK (e.g. `parent_id`) | Supported — same table, just another hop. |
| FK metadata missing entirely | Optional heuristic fallback (Q3): "find this value in columns named `<thiscol>` across tables" — clearly labelled as a guess, not a real FK. |
| Value type unknown | Fall back to quoted literal (Postgres coerces for the common comparison). |

---

## 8. Phasing / milestones

1. **FK introspection** — extend metadata query + cache; expose via API. Verifiable
   with a curl/round-trip; also enriches the schema tree as a side benefit.
2. **Frontend metadata plumbing** — types + page state for FK/reverse maps.
3. **Outbound drill-down** — cell affordance + menu + typed query gen + new-tab run.
   (Outbound is the simpler, higher-frequency half — ship it first.)
4. **Inbound drill-down** — reverse-map pick-list.
5. **Polish** — composite keys, fan-out caps, self-refs, degradation, naming, the
   optional heuristic fallback.

Each milestone is independently shippable; (1)+(2) have standalone value (the
schema tree can show "→ references X" relationships even before the grid UI).

---

## 9. Success metrics

Hard analytics aren't wired up, so proxy signals:
- Drill-down actions per debugging session (adoption).
- Reduction in manually-typed single-row lookup queries (`WHERE pk = …`) in history.
- Qualitative: "I stopped copy-pasting ids" from the team.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| FK metadata incomplete/poorly defined in some envs | Degrade gracefully (no affordance); optional heuristic fallback; never error. |
| Drill-down generates a heavy query (huge child table, no index on FK col) | Default `LIMIT`; rely on the (now-fixed) query timeout; FK columns are usually indexed. |
| Source-table detection is fragile (`extractTableFromQuery` misses cases) | Feature degrades silently; improving that regex benefits delete/edit too. |
| Tab proliferation during long investigations | Acceptable for v1; revisit with a back-stack/trail (§12). |
| Composite-FK column pairing via `information_schema` is imprecise | Use `pg_catalog.pg_constraint` if needed (Q4). |

---

## 11. Open questions (lock before/at build)

- **Q1.** Results open in a **new tab** (recommended) vs replace-in-place vs a
  side panel? *Proposed: new tab.*
- **Q2.** Inbound: **pick-list, never auto-run** (recommended) vs auto-run the most
  common child? *Proposed: pick-list.*
- **Q3.** Ship the **heuristic fallback** (value-in-similarly-named-columns) for
  tables lacking FKs, or FK-only for v1? *Proposed: FK-only first.*
- **Q4.** Composite FKs via `information_schema` or `pg_catalog.pg_constraint`?
  *Proposed: start single-column; add `pg_constraint` if composite FKs are common.*
- **Q5.** Default `LIMIT` for generated queries — 100? Configurable?
- **Q6.** Affordance UX — always-visible glyph, hover-only, or right-click menu?

---

## 12. Future / north-star

- **Investigation trail / back-stack** — explicit breadcrumb of hops with back/forward.
- **Visual relationship map** — ERD-style canvas seeded from FK metadata.
- **Derived Context values** — tie drill-down into Context: resolving `@programId`
  could auto-populate `@clientId`/`@issuerId` via the FK graph (the "investigation
  accelerator" north-star from the Context discussion).
- **Saved investigation runbooks** — capture a sequence of hops as a replayable,
  parameterized flow.
