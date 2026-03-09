# P1-006: Sensitive Debug Logging in Runtime Paths

**Priority**: P1 (High)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 2-3 hours

---

## Problem

Debug logs in runtime code may leak sensitive operational hints:

- `lib/db.ts` logs sandbox connection metadata including password characteristics.
- `lib/templates.ts` logs parsed template lines.

---

## Risk Assessment

- **Security**: Sensitive patterns may leak into centralized logs.
- **Compliance**: Logging policies often forbid credential-adjacent data.
- **Operations**: Harder to safely share logs for debugging.

---

## Solution

1. Remove unsafe logs from production code paths.
2. If debug logs are needed, gate with secure env flag and redact.
3. Add logger utility with standard redaction policy.

---

## Verification

- [ ] No credential-adjacent fields appear in logs.
- [ ] Template SQL/variables are not logged in plaintext.
- [ ] Debug mode is opt-in and redacted.
