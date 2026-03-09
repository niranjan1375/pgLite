# P0-004: Missing API Authentication & Authorization

**Priority**: P0 (Critical)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 1-2 days

---

## Problem

All API routes are callable without authentication or role checks.

Affected routes include:

- `app/api/query/route.ts`
- `app/api/workspace-query/route.ts`
- `app/api/workspace-schemas/route.ts`
- `app/api/databases/route.ts`
- `app/api/tables/route.ts`
- `app/api/columns/route.ts`

This allows anonymous callers to execute SQL and enumerate metadata if the app is network-accessible.

---

## Risk Assessment

- **Security**: Unauthorized read/write access to production data.
- **Compliance**: Fails baseline access-control requirements.
- **Business**: Immediate breach risk if deployed publicly.

---

## Solution

1. Add authentication middleware for all `/api/*` routes.
2. Require authenticated user context in route handlers.
3. Enforce role-based authorization:

- `query.execute`
- `schema.read`
- `workspace.query.execute`

4. Deny by default when auth context is missing.

---

## Verification

- [ ] Unauthenticated requests to `/api/*` return `401`.
- [ ] Authenticated but unauthorized users return `403`.
- [ ] Authorized users can execute only allowed actions.
- [ ] Audit logs include user ID and route for each query request.
