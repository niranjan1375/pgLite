# P2-003: Frontend-Only Read Protection

**Priority**: P2 (Medium)  
**Status**: Open  
**Created**: 2026-02-27  
**Effort**: 4 hours

---

## Problem

Current "Read-Only" mode uses regex parsing on client:

```typescript
function isWriteQuery(query: string): boolean {
    return /^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i.test(query);
}
```

**Bypasses**:

1. **CTEs**: `WITH data AS (DELETE FROM users RETURNING *) SELECT * FROM data;`
2. **Functions**: `SELECT delete_all_users();`
3. **Comments**: `/* UPDATE users */ SELECT * FROM users;`
4. **Stored Procs**: `CALL purge_data();`

Attacker can trivially bypass protection with any of above.

---

## Risk Assessment

- **Data Integrity**: Malicious/accidental writes despite "Read-Only" toggle
- **Compliance**: Cannot guarantee audit trail accuracy
- **Trust**: Users expect "Read-Only" to be enforced

---

## Solution (Proper)

### Use PostgreSQL Read-Only Roles

#### Step 1: Create Read-Only Database Role

```sql
-- On each production database
CREATE ROLE readonly_user WITH LOGIN PASSWORD 'readonly_pass';

-- Grant read-only access
GRANT CONNECT ON DATABASE mydb TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;

-- Explicitly deny writes
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM readonly_user;
```

#### Step 2: Add Read-Only Credentials to Environments

```typescript
// lib/environments.ts
export interface Environment {
    id: string;
    name: string;
    host: string;
    user: string;
    password: string;
    readonlyUser: string; // ⭐ New
    readonlyPassword: string; // ⭐ New
    // ...
}

export const environments: Environment[] = [
    {
        id: "production",
        name: "Production",
        user: "admin",
        password: process.env.PROD_ADMIN_PASSWORD!,
        readonlyUser: "readonly_user", // ⭐
        readonlyPassword: process.env.PROD_READONLY_PASSWORD!, // ⭐
    },
];
```

#### Step 3: Use Read-Only Credentials When Enabled

```typescript
// lib/db.ts
export function getPool(
    env: Environment,
    database: string,
    readOnly: boolean,
): Pool {
    const key = `${env.id}:${database}:${readOnly ? "ro" : "rw"}`;

    if (!pools.has(key)) {
        const user = readOnly ? env.readonlyUser : env.user;
        const password = readOnly ? env.readonlyPassword : env.password;

        pools.set(
            key,
            new Pool({
                host: env.host,
                user,
                password,
                database,
                max: 5,
            }),
        );
    }

    return pools.get(key)!;
}
```

#### Step 4: Remove Regex Check

```typescript
// app/api/query/route.ts
// OLD: isWriteQuery() check ❌
// NEW: PostgreSQL enforces via role permissions ✅

const pool = getPool(env, database, readOnly);
const result = await pool.query(query); // Will fail if write attempted
```

---

## Enforcement Example

```sql
-- User toggles "Read-Only" and tries:
DELETE FROM users WHERE id = 1;

-- PostgreSQL returns:
ERROR:  permission denied for table users
```

**No bypass possible** - enforced at database level.

---

## Fallback: Transaction-Level Read-Only

If database roles unavailable:

```sql
BEGIN TRANSACTION READ ONLY;
  SELECT * FROM users; -- ✅ Allowed
  DELETE FROM users;   -- ❌ ERROR: cannot execute DELETE in a read-only transaction
COMMIT;
```

```typescript
if (readOnly) {
    await client.query("BEGIN TRANSACTION READ ONLY");
}
const result = await client.query(query);
if (readOnly) {
    await client.query("COMMIT");
}
```

---

## Verification

- [ ] Read-only role created on all databases
- [ ] Read-only toggle uses `readonly_user` credentials
- [ ] Write queries fail with "permission denied" error
- [ ] CTE/function/comment bypasses blocked
- [ ] Test: `WITH x AS (DELETE FROM users RETURNING *) SELECT 1` fails

---

## Notes

- Per-database role setup required (DevOps effort)
- Simpler fallback: `BEGIN TRANSACTION READ ONLY`
- Consider row-level security (RLS) for finer control
