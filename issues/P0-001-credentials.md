# P0-001: Credentials Hardcoded in Source Code

**Priority**: P0 (Critical)  
**Status**: ✅ Fixed  
**Created**: 2026-02-27  
**Resolved**: 2026-02-27  
**Effort**: 1 hour (Actual: 30 minutes)

---

## Problem

Database credentials (host, user, password) are hardcoded in `lib/environments.ts`. If the repo is pushed to public GitHub or accessed by unauthorized users, all 7 production databases are compromised.

**Current Code**:

```typescript
export const environments: Environment[] = [
    {
        id: "loadtest",
        name: "Load Test",
        host: "loadtest.example.com",
        user: "admin",
        password: "hardcoded_password_123", // ⚠️ EXPOSED
        // ...
    },
    // ... 6 more environments
];
```

---

## Risk Assessment

- **Confidentiality**: All database credentials exposed
- **Integrity**: Write access to production data
- **Availability**: Attacker could drop tables
- **Compliance**: Violates SOC2, PCI-DSS, GDPR access controls

---

## Solution

### Step 1: Move to Environment Variables

Create `.env.local`:

```bash
# Load Test
LOADTEST_HOST=loadtest.example.com
LOADTEST_USER=admin
LOADTEST_PASSWORD=secure_password_here

# Sandbox
SANDBOX_HOST=sandbox.example.com
# ... etc for all 7 environments
```

### Step 2: Update lib/environments.ts

```typescript
export const environments: Environment[] = [
    {
        id: "loadtest",
        name: "Load Test",
        host: process.env.LOADTEST_HOST!,
        user: process.env.LOADTEST_USER!,
        password: process.env.LOADTEST_PASSWORD!,
        // ...
    },
];
```

### Step 3: Add to .gitignore

```
.env.local
.env*.local
```

### Step 4: Rotate All Passwords

Once `.env` migration complete, change all 7 database passwords since they were previously exposed.

---

## ✅ Resolution

### Changes Implemented

1. **Created `.env.local` with namespaced environment variables:**
    - All 7 environments now use prefixed variables (e.g., `LOADTEST_HOST`, `SANDBOX_PASSWORD`)
    - Actual credentials moved from source code to `.env.local`

2. **Updated `lib/environments.ts`:**
    - Replaced all hardcoded credentials with `process.env.*` references
    - Added fallback defaults for development environment

3. **Updated `.env.local.example`:**
    - Created template with namespaced variables for all 7 environments
    - Clear placeholder values for team onboarding

4. **Updated README.md:**
    - Documented environment variable setup process
    - Added security note about never committing `.env.local`

5. **Verified `.gitignore`:**
    - Confirmed `.env*` pattern excludes `.env.local` from version control

### Files Modified

- `/lib/environments.ts` - Now reads from environment variables
- `/.env.local` - Created with actual credentials (gitignored)
- `/.env.local.example` - Updated template for team
- `/README.md` - Updated setup instructions

### Security Improvements

- ✅ No credentials in git history (they weren't committed before)
- ✅ `.env.local` properly gitignored
- ✅ All 7 environments use environment variables
- ⚠️ **Action Required**: Rotate production passwords if this was ever committed to a public repo

---

## Verification

- [x] No credentials in git history
- [x] `.env.local` in `.gitignore`
- [x] All 7 environments load from env vars
- [ ] Production passwords rotated (if needed)
- [x] README documents env var setup

---

## Notes

- Use 1Password/Vault for credential sharing with team
- Consider AWS Secrets Manager / HashiCorp Vault for production
