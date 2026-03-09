# P1-004: Missing Rate Limiting & Abuse Controls

**Priority**: P1 (High)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 1 day

---

## Problem

API routes do not enforce request throttling, quota, or abuse controls.

No `middleware.ts` currently applies rate limiting for SQL/metadata endpoints.

---

## Risk Assessment

- **Security**: Easy query-flood DoS vector.
- **Reliability**: Burst traffic can starve DB and API workers.
- **Cost**: Unbounded compute/DB spend under abuse.

---

## Solution

1. Add route-aware rate limiting (IP + user key).
2. Add stricter limits for query execution endpoints.
3. Return `429` with retry headers.
4. Log and alert on sustained throttling events.

---

## Verification

- [ ] Repeated burst calls return `429`.
- [ ] Normal user traffic remains unaffected.
- [ ] Alerts trigger for sustained abuse patterns.
