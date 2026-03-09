# pgLite Issues & Technical Debt Tracker

## Priority Levels

- **P0 (Critical)**: Must fix before production use. Security/stability risks.
- **P1 (High)**: Should fix before multi-user deployment. Major usability/performance gaps.
- **P2 (Medium)**: Nice to have. Improves UX but not blocking.

---

## P0 - Critical (BLOCKER)

### [P0-001] Credentials Hardcoded in Source

**File**: `issues/P0-001-credentials.md`  
**Status**: ✅ Fixed (2026-02-27)  
**Risk**: All 7 databases compromised if repo leaked  
**Effort**: 1 hour (Actual: 30 min)

### [P0-002] Unlimited Query Result Size

**File**: `issues/P0-002-unlimited-results.md`  
**Status**: ✅ Fixed (2026-02-27)  
**Risk**: DoS, memory overflow, browser crash  
**Effort**: 2 hours (Actual: 30 min)

### [P0-003] No Query Timeout

**File**: `issues/P0-003-query-timeout.md`  
**Status**: Open  
**Risk**: Runaway queries lock database indefinitely  
**Effort**: 30 minutes

### [P0-004] Missing API Authentication & Authorization

**File**: `issues/P0-004-api-authentication.md`  
**Status**: Open  
**Risk**: Unauthenticated SQL and schema access  
**Effort**: 1-2 days

### [P0-005] Workspace Query Connection Leak

**File**: `issues/P0-005-workspace-query-connection-leak.md`  
**Status**: Open  
**Risk**: Database connection exhaustion  
**Effort**: 4-6 hours

### [P0-006] TLS Certificate Verification Disabled

**File**: `issues/P0-006-tls-verification-disabled.md`  
**Status**: Open  
**Risk**: MITM exposure and compliance risk  
**Effort**: 2-4 hours

---

## P1 - High (Should Fix)

### [P1-001] Pool-Per-Request Architecture

**File**: `issues/P1-001-connection-pooling.md`  
**Status**: Open  
**Risk**: Connection exhaustion under load  
**Effort**: 4 hours

### [P1-002] No Query Observability

**File**: `issues/P1-002-logging.md`  
**Status**: Open  
**Risk**: Cannot debug slow/failed queries  
**Effort**: 2 hours

### [P1-003] No Query Cancellation

**File**: `issues/P1-003-cancel-query.md`  
**Status**: Open  
**Risk**: Cannot stop long-running queries  
**Effort**: 3 hours

### [P1-004] Missing Rate Limiting & Abuse Controls

**File**: `issues/P1-004-missing-rate-limiting.md`  
**Status**: Open  
**Risk**: Query flood / denial of service  
**Effort**: 1 day

### [P1-005] Workspace Query Missing Result Size Guard

**File**: `issues/P1-005-workspace-result-limit-missing.md`  
**Status**: Open  
**Risk**: Memory pressure and browser/API instability  
**Effort**: 2-4 hours

### [P1-006] Sensitive Debug Logging in Runtime Paths

**File**: `issues/P1-006-debug-log-sanitization.md`  
**Status**: Open  
**Risk**: Sensitive hints leaked to logs  
**Effort**: 2-3 hours

### [P1-007] Static Environment Registry Blocks Multi-Tenant Growth

**File**: `issues/P1-007-dynamic-environment-registry.md`  
**Status**: Open  
**Risk**: Cannot add/remove/rename environments without redeploy  
**Effort**: 2-4 days

---

## P2 - Medium (Nice to Have)

### [P2-001] All-or-Nothing Result Loading

**File**: `issues/P2-001-cursor-streaming.md`  
**Status**: Open  
**Impact**: Wastes memory/bandwidth for large results  
**Effort**: 1 week

### [P2-002] No EXPLAIN Analysis UI

**File**: `issues/P2-002-explain-ui.md`  
**Status**: Open  
**Impact**: Cannot optimize slow queries  
**Effort**: 3 days

### [P2-003] Frontend-Only Read Protection

**File**: `issues/P2-003-readonly-roles.md`  
**Status**: Open  
**Impact**: Write protection easily bypassed  
**Effort**: 4 hours

---

## Quick Stats

- **Total Issues**: 16
- **P0 (Critical)**: 4 open, 2 fixed
- **P1 (High)**: 7 open
- **P2 (Medium)**: 3 open
- **Estimated Remaining Effort**: ~3 weeks

---

## Usage

When working on an issue:

1. Open the issue file (e.g., `issues/P0-001-credentials.md`)
2. Update status to "In Progress"
3. Implement fix
4. Update status to "Fixed" with PR/commit reference
5. Move to `issues/resolved/` folder

When new issues arise:

1. Create new issue file: `issues/PX-NNN-description.md`
2. Add entry to this README
3. Prioritize appropriately
