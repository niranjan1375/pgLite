# P0-001: Credentials Hardcoded in Source Code

**Priority**: P0 (Critical)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 1 hour

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

## Verification

- [ ] No credentials in git history
- [ ] `.env.local` in `.gitignore`
- [ ] All 7 environments load from env vars
- [ ] Production passwords rotated
- [ ] README documents env var setup

---

## Notes

- Use 1Password/Vault for credential sharing with team
- Consider AWS Secrets Manager / HashiCorp Vault for production
