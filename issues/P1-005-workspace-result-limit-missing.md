# P1-005: Workspace Query Missing Result Size Guard

**Priority**: P1 (High)  
**Status**: Open  
**Owner**: Unassigned  
**Pre-Ship**: Yes  
**Created**: 2026-03-09  
**Effort**: 2-4 hours

---

## Problem

`app/api/workspace-query/route.ts` does not enforce a maximum row limit equivalent to `MAX_ROWS` used in `app/api/query/route.ts`.

---

## Risk Assessment

- **Reliability**: Large result sets can consume server memory.
- **UX**: Browser tab freeze/crash on huge payloads.
- **Security**: Amplifies DoS via expensive result retrieval.

---

## Solution

1. Apply a shared server-side row cap in workspace route.
2. Return explicit truncation/limit error responses.
3. Optionally add cursor/pagination for large result navigation.

---

## Verification

- [ ] Workspace route rejects oversized result sets predictably.
- [ ] Error payload includes returned row count and max limit.
- [ ] Browser remains responsive on heavy queries.
