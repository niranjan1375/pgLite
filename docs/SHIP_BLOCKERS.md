# Ship Blockers

Last updated: 2026-03-09

This document lists issues that must be addressed before production rollout.

## Do Not Ship Until These Are Fixed

- Any open item in `Critical`.
- Any open item in `Security`.
- Any `High Impact` item marked as `Pre-Ship`.

## Critical

### C-001: Unauthenticated SQL execution APIs

- Severity: Critical
- Pre-Ship: Yes
- Tracking: `issues/P0-004-api-authentication.md`
- Files: `app/api/query/route.ts`, `app/api/workspace-query/route.ts`, `app/api/workspace-schemas/route.ts`, `app/api/databases/route.ts`, `app/api/tables/route.ts`, `app/api/columns/route.ts`
- Risk: Anyone who can reach the app can execute queries or read schema metadata.
- Why this blocks ship: Direct data exposure and modification risk in publicly reachable deployments.

### C-002: Connection leak in workspace query route

- Severity: Critical
- Pre-Ship: Yes
- Tracking: `issues/P0-005-workspace-query-connection-leak.md`
- File: `app/api/workspace-query/route.ts`
- Risk: Pool created per request is not closed (`pool.end()` missing), leading to connection exhaustion.
- Why this blocks ship: Service degradation/outage under normal usage.

### C-003: TLS server cert verification disabled

- Severity: Critical
- Pre-Ship: Yes
- Tracking: `issues/P0-006-tls-verification-disabled.md`
- File: `lib/db.ts`
- Risk: `ssl.rejectUnauthorized: false` weakens transport security.
- Why this blocks ship: Potential MITM and compliance failure in enterprise environments.

## High Impact

### H-001: Pool-per-request architecture

- Severity: High Impact
- Pre-Ship: Yes
- Tracking: `issues/P1-001-connection-pooling.md`
- Files: `lib/db.ts`, API routes under `app/api/**/route.ts`
- Risk: Frequent pool create/destroy causes connection churn and poor scalability.
- Why this matters: Performance collapse under concurrent usage.

### H-002: Missing result cap in workspace mode

- Severity: High Impact
- Pre-Ship: Yes
- Tracking: `issues/P1-005-workspace-result-limit-missing.md`
- File: `app/api/workspace-query/route.ts`
- Risk: Large query responses can consume excessive memory and crash API/browser.
- Why this matters: Reliability and user-session stability.

### H-003: No query cancellation

- Severity: High Impact
- Pre-Ship: Recommended
- Tracking: `issues/P1-003-cancel-query.md`
- File: `app/api/query/route.ts` (and UI flow)
- Risk: Long-running queries cannot be stopped by users.
- Why this matters: Operational pain, blocked sessions, poor UX.

### H-004: Expensive workspace schema scanning

- Severity: High Impact
- Pre-Ship: Recommended
- File: `app/api/workspace-schemas/route.ts`
- Risk: N+1 query pattern across databases/tables/columns can overload DB on large estates.
- Why this matters: Latency spikes and avoidable DB load.

### H-005: Static environment model (cannot add/remove/rename without deploy)

- Severity: High Impact
- Pre-Ship: Yes (for general-purpose/multi-user product)
- Tracking: `issues/P1-007-dynamic-environment-registry.md`
- Files: `lib/environments.ts`, `components/EnvironmentSelector.tsx`
- Risk: Onboarding new DB environments requires code changes and redeploys.
- Why this matters: Blocks product scalability and multi-tenant operations.

## Security

### S-001: Missing authentication/authorization controls

- Severity: Security
- Pre-Ship: Yes
- Tracking: `issues/P0-004-api-authentication.md`
- Files: All API routes under `app/api/**/route.ts`
- Risk: No identity boundary for destructive/data-sensitive operations.
- Fix direction: Add authn/authz middleware and role-based access checks.

### S-002: Missing rate limiting and abuse controls

- Severity: Security
- Pre-Ship: Yes
- Tracking: `issues/P1-004-missing-rate-limiting.md`
- Files: API surface (no `middleware.ts` present)
- Risk: Endpoint abuse and query flooding can cause denial of service.
- Fix direction: Per-IP/user limits and stricter request guards.

### S-003: Read-only guard is bypassable from client

- Severity: Security
- Pre-Ship: Yes
- Tracking: `issues/P2-003-readonly-roles.md`
- File: `app/api/query/route.ts`
- Risk: Write blocking depends on `readOnly` request flag from client; attacker can set false.
- Fix direction: Enforce read-only at server by role/env policy and DB permissions.

### S-004: Debug logs may leak sensitive hints

- Severity: Security
- Pre-Ship: Yes
- Tracking: `issues/P1-006-debug-log-sanitization.md`
- Files: `lib/db.ts`, `lib/templates.ts`
- Risk: Connection metadata and template content can enter logs.
- Fix direction: Remove debug logs or gate behind secure debug flags.

## Minimal Pre-Ship Exit Criteria

- Authn/authz enforced for all SQL and metadata APIs.
- Workspace query path closes pools/clients reliably and is load-tested.
- TLS verification enabled with trusted CA setup.
- Server-side query/result guards are consistent across standard and workspace modes.
- Rate limiting and audit logging are enabled.
