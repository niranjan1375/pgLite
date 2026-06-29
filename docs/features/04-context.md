# Feature: Context — shared, environment-scoped values

> Status: **Spec / approved direction** · 2026-06-26 · workspace-mode only
> Replaces the chore of re-declaring & re-valuing common identifiers
> (`programId`, `clientId`, …) in every workspace template, for every env.

---

## 1. Problem

In workspace mode, variables are per-template and per-run:

- `lib/templates.ts` requires every template to declare `@name = value` at the top.
- `app/api/workspace-query/route.ts` rejects any `@var` referenced but not provided.

But identifiers like `programId` / `clientId` are the **same concept everywhere**
with **different values per environment**. Today the user must (a) re-declare them
in each template and (b) hand-edit the values every time they switch environment.

**Goal:** define these once, in a shared store, and reference `@programId` in any
workspace query — auto-resolving to the right value for the selected environment,
with no local declaration.

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Context** | The feature: reusable, environment-scoped values, shared org-wide. |
| **Profile** | A switchable named set inside Context (e.g. `Default`, `Acme`). One is *active* at a time, per user. |
| **Context value** | A single key (e.g. `programId`) with a value **per environment**. |
| **Local variable** | The existing per-query `@name = value` declared at the top of a query. Unchanged. |

In SQL, both Context values and local variables use the **same `@name` syntax**.
Resolution merges them (see §5); the UI always labels Context-sourced ones as
*"from Context"* so they're never confused with local declarations.

**Code naming:** "Context" is the **UI label only**. In code, use unambiguous
names (`SharedVariables`, `contextProfiles`, `lib/variable-resolver.ts`) to avoid
collision with React Context / execution contexts.

---

## 3. Data model — `.pgconsole/contexts.json` (env-first)

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "default",
      "name": "Default",
      "updatedAt": "2026-06-26T00:00:00.000Z",
      "environments": {
        "staging":     { "programId": "PRG_ST",  "clientId": "CLI_1" },
        "vegapay-uat": { "programId": "PRG_UAT", "clientId": "CLI_2" },
        "dev":         { "programId": "PRG_DEV" }
      }
    }
  ]
}
```

- **`version`**: top-level schema version for painless future migrations.
- **`updatedAt`** (per profile): set on every write, for auditing unexpected
  changes. (`updatedBy` deferred until auth/identity exists — P0-004.)

- **Env-first** nesting: `environments[envId][key] = value`. Env keys = environment
  IDs from `lib/environments.ts`. Chosen because it matches `credentials.json` /
  `.env.*` mental model and makes runtime resolution a single object lookup.
- A key need not have a value for every env (unset → clear run-time error, §5).
- A `Default` profile is auto-created on first use; if the user never adds a second
  profile, profiles stay invisible in the UI and it behaves like a single shared set.

---

## 4. Storage

- **File on a mounted Docker volume**, sibling to `credentials.json` / `templates/`.
  Single source of truth, shared by everyone hitting the deployment.
- **Definitions are shared** (the file). **Active-profile selection is per-user**
  (localStorage key `pgLite_activeContextProfile`) — two users can work different
  profiles at once.
- **Caveat (future):** correct for a **single container**. If pgLite ever runs
  **multiple replicas** behind a load balancer, file storage won't be shared and
  this must move to a Postgres table (e.g. a `pgconsole_meta` DB). Not now.
- **Security note:** like `credentials.json`, this is writable by anyone reaching
  the app until auth (P0-004) lands. Fine for internal/trusted use; don't put
  secrets here.

---

## 5. Resolution & precedence (client-side)

Resolution lives in a **dedicated pure module `lib/variable-resolver.ts`** — not
inline in `page.tsx`. There are several query-trigger paths (Run button, ⌘↵, row
delete, future ones); a single tested function keeps them consistent and avoids
duplicated merge logic in the already-large `page.tsx`.

```ts
// lib/variable-resolver.ts
resolveVariables({ profile, local, environment }) // => effectiveVars
```

At run time it builds the effective variables map:

```
effectiveVars = { ...activeProfile.environments[currentEnv], ...localDeclaredVars }
```

1. Start with the active profile's values for the **current environment**.
2. Overlay any **local `@var = value`** declared in the query — **local wins**.
3. Send `effectiveVars` to `/api/workspace-query` as the existing `variables` payload.
4. A referenced `@var` resolved by neither → the same "undefined variable" error
   that exists today.

**Backend stays unchanged.** Because Context values are merged into the existing
`variables` payload before sending, `workspace-query` validates and substitutes
exactly as it does now. (Resolution can move server-side later if a value ever
needs to stay off the client — would send `{ profileId, environment }` instead.)

---

## 6. API — `app/api/contexts/route.ts`

Mirrors the templates route (file-backed):

- `GET /api/contexts` → returns the full `contexts.json` (all profiles).
- `PUT /api/contexts` → writes the full document (create/update/delete profiles
  and values in one save). Validates shape + env IDs against `lib/environments.ts`.

(Single-document read/write keeps it simple; can split to per-profile later.)

---

## 7. UI

- **ActivityBar:** add a 4th icon → **Context** (alongside Database / History / Saved).
- **Sidebar panel (manage view):**
  - Profile dropdown (+ add / rename / delete profile; mark active).
  - A **grid: keys (rows) × environments (columns)**, inline-editable. Add/remove key.
  - The grid presentation is independent of the JSON nesting — always keys×envs.
- **Modal (quick view):** peek/edit the active profile's values for the *current* env
  while mid-query, without leaving the editor.
- Both reuse existing design tokens (`lib/design-system.ts`) and the brutalist style.

---

## 8. Editor integration (`components/SQLEditor.tsx`)

- Autocomplete suggests Context keys for the active profile (priority near `@vars`),
  with a detail label like `from Context · Default`.
- A subtle inline hint / gutter marker shows which referenced `@names` resolve from
  Context vs are declared locally, and flags any that are **unset for current env**.

---

## 9. Validation changes (the one architectural touch)

Today a workspace query/template must declare every `@var` it references:

- `lib/workspace-utils.ts` (`validateVariableReferences`) — treat Context-provided
  keys as satisfied so an undeclared `@programId` is valid.
- `lib/templates.ts` (`parseTemplate`) — relax the "≥1 declared variable" rule so a
  saved template can rely solely on Context values (zero local declarations).
- No change to substitution/escaping (`applyVariables`, numeric/NULL handling).

---

## 10. Edge cases

- **Env renamed/removed:** stale env keys in `contexts.json` are ignored at
  resolution; surface them in the panel as "unknown environment" rather than erroring.
- **Key unset for current env:** editor hint shows "unset for {env}"; run produces
  the standard undefined-variable error pointing at that key.
- **Local override:** `@programId = 'X'` in the query always beats Context (§5).
- **Empty Context:** no profiles / no values → behaves exactly like today.

---

## 11. Build plan

1. **Storage + API** — `contexts.json` schema, `GET/PUT /api/contexts`, shape validation.
2. **Resolution** — merge Context into `variables` payload in `page.tsx` run path;
   relax `workspace-utils` / `templates` validation.
3. **Sidebar panel** — ActivityBar icon + keys×envs grid + profile management.
4. **Modal + editor hints** — quick-edit modal, autocomplete + "from Context" markers.
5. **Polish** — unset/unknown-env states, empty states, docs.

Each step is independently shippable; (1)+(2) already deliver the core value
(values resolve, no re-declaration) even before the full UI.

---

## 12. Open / future

- **Retiring standard mode** — under discussion. Context is workspace-only; if
  standard mode is removed, nothing here changes.
- **Server-side resolution** — switch if any Context value becomes sensitive.
- **Multi-replica deploy** — move storage file → Postgres table.
- **Per-profile sharing/permissions** — only meaningful once auth (P0-004) exists.
- **Bundles** — already covered: a *profile* IS a bundle (programId + clientId +
  issuerId + … for one tenant). Switching the active profile switches the whole set.
- **★ Derived Context values (north-star)** — let one value populate others via a
  SQL lookup: `programId → query → { accountId, customerId, cardId }`. Turns Context
  from static config into an investigation accelerator. Post-V1: needs lookup
  execution, caching, and staleness handling, but it's the highest-leverage
  extension and the reason this feature trends toward an "investigation platform."
