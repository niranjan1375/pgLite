# P1-007: Static Environment Registry Blocks Multi-Tenant Growth

**Priority**: P1 (High)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes (for productized multi-user deployment)  
**Created**: 2026-03-09  
**Effort**: 2-4 days

---

## Problem

Environment definitions are hardcoded in source (`lib/environments.ts`) with fixed env-variable prefixes (`LOADTEST_*`, `SANDBOX_*`, etc.).

Impact:

- Cannot add/remove/rename environments without code changes and redeploy.
- Cannot cleanly support multiple production environments with arbitrary names.
- Environment metadata is duplicated in UI (`components/EnvironmentSelector.tsx`).

---

## Risk Assessment

- **Scalability**: New customer or environment onboarding requires engineering work.
- **Operations**: Manual config drift between backend and frontend.
- **Product Fit**: Not usable as a general-purpose DB admin app.

---

## Solution

1. Replace hardcoded environment map with a dynamic registry.
2. Store environment metadata in DB or secure config service:

- `id`, `label`, `host`, `port`, `db`, `requires_vpn`, `tier`, `read_only`, `is_active`

3. Encrypt credentials at rest (KMS or equivalent).
4. Add admin API/UI to create, edit, disable, reorder environments.
5. Introduce environment tags/tiers (`prod`, `staging`, `dev`) to support multiple prod targets.
6. Make all UI environment menus read from registry API (single source of truth).

---

## Verification

- [ ] Add new environment without code deploy.
- [ ] Rename environment and see update in all tabs/UI.
- [ ] Disable environment and block new queries immediately.
- [ ] Support 2+ production environments (e.g., `prod-eu`, `prod-us`).
- [ ] Secrets are encrypted and never exposed to client.
