# P0-006: TLS Certificate Verification Disabled

**Priority**: P0 (Critical)  
**Status**: ✅ Fixed (2026-10-23, branch `fix/tls-verify`)  
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

- [x] TLS connections succeed with valid CA (Azure loadtest/sandbox/staging verify with Node's CAs).
- [x] Invalid cert chain is rejected (wrong `sslCa` → `SELF_SIGNED_CERT_IN_CHAIN` + fix hint).
- [x] No environment uses `rejectUnauthorized: false` unless it opts in with `"ssl": "require"`, which logs a warning for production envs.

## Resolution

Per-environment `ssl` (`verify` | `require` | `disable`) and `sslCa` in the
credentials file — see `lib/tls.ts` and `docs/CREDENTIALS_FILE_FORMAT.md`.
Remote hosts verify by default; an unreadable `sslCa` fails that environment
with a clear error.
