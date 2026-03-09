# P0-006: TLS Certificate Verification Disabled

**Priority**: P0 (Critical)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 2-4 hours

---

## Problem

`lib/db.ts` sets:

```ts
ssl: {
  rejectUnauthorized: false,
}
```

This disables server certificate verification for database TLS.

---

## Risk Assessment

- **Security**: Vulnerable to man-in-the-middle attacks.
- **Compliance**: Violates common security baselines.
- **Trust**: Weakens integrity of app-to-DB channel.

---

## Solution

1. Enable strict TLS verification (`rejectUnauthorized: true`).
2. Configure trusted CA/cert chain via environment variables.
3. Fail fast with clear startup error if cert config is invalid.

---

## Verification

- [ ] TLS connections succeed with valid CA.
- [ ] Invalid cert chain is rejected.
- [ ] No environment uses `rejectUnauthorized: false` in production.
