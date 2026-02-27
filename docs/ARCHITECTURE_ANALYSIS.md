# Architecture Analysis: Global vs Per-Tab Environment/Database Selection

## Current Implementation (Global Scope)

### How it works:

- **Single environment selector** in the sidebar
- **Single database selector** in the sidebar
- **All query tabs** share the same environment and database context
- Switching environment/database affects all tabs simultaneously

### Pros ✅

1. **Simple & Intuitive**: Users understand they're working in one context
2. **Less Cognitive Load**: Don't need to track which tab is in which environment
3. **Safer**: Reduces risk of accidentally running queries in wrong environment
4. **Less Complex State**: Single source of truth for env/db
5. **Better UX for Common Use Cases**:
    - Most users work in one environment at a time
    - Exploring different tables in the same database
    - Running related queries in the same context

### Cons ❌

1. **Cannot compare data across environments**: Can't query prod and staging simultaneously
2. **Cannot work with multiple databases**: Must switch context to work with different DBs
3. **Tab switching confusion**: If you write queries for different purposes, switching tabs doesn't switch context
4. **Lost work**: Switching environment while having queries for different envs in tabs could be confusing

---

## Alternative: Per-Tab Environment/Database Selection

### How it would work:

- Each query tab has its own environment and database selection
- Tab UI shows which env/db it's targeting
- Results are scoped to that tab's context

### Pros ✅

1. **Multi-environment workflows**: Compare prod vs staging data side-by-side
2. **Multi-database workflows**: Work with different databases simultaneously
3. **Context preservation**: Each tab maintains its own context
4. **Professional tool feel**: Similar to DataGrip, DBeaver, etc.

### Cons ❌

1. **More complex UI**: Need env/db selector in each tab or in tab header
2. **Confusing for beginners**: Easy to lose track of which tab is in which environment
3. **Dangerous**: Could accidentally run DROP/UPDATE in production thinking you're in staging
4. **More state management**: Need to track env/db per tab
5. **Visual clutter**: More UI elements competing for space

---

## Hybrid Approach (Recommended)

### Design:

1. **Global environment/database** (default) - shown in sidebar
2. **Per-tab override** (optional):
    - Small indicator in tab showing if it's using different context
    - Click to "pin" tab to specific env/db
    - Visual warning (color coding) when tab overrides global setting

### Implementation:

```typescript
interface QueryTab {
    id: string;
    name: string;
    query: string;
    // Optional overrides
    pinnedEnvironment?: string; // If set, uses this instead of global
    pinnedDatabase?: string; // If set, uses this instead of global
}
```

### Tab UI would show:

```
[Query 1] [Query 2 🔒 Sandbox] [Query 3 🔒 Staging]
```

### Benefits:

- ✅ Simple by default (global context)
- ✅ Power users can pin tabs to specific environments
- ✅ Visual indicators prevent mistakes
- ✅ Enables comparison workflows
- ✅ Gradual learning curve

---

## Recommendation

### For Your Current Use Case:

**Keep GLOBAL approach with small enhancements:**

#### Why:

1. **Your environment list includes production-like DBs** (UAT, Staging)
    - Global context is SAFER - prevents accidental cross-environment mistakes
    - You want to be very aware when switching environments

2. **You're accessing VPN-protected environments**
    - Likely working in one environment per session
    - VPN connection often determines which env you can access

3. **Multiple environments with same schema**
    - Your envs (VegaPay UAT, Unity UAT, etc.) likely have similar schemas
    - You're likely comparing behavior, not querying multiple at once

#### Suggested Enhancements:

1. **Add environment indicator to query editor header**

    ```tsx
    <div className="bg-gray-800 px-4 py-2 text-xs">
        <span className="text-gray-400">Environment:</span>
        <span className="text-cyan-400 font-semibold">Loadtest Azure</span>
        <span className="mx-2">|</span>
        <span className="text-gray-400">Database:</span>
        <span className="text-green-400">{selectedDatabase}</span>
    </div>
    ```

2. **Add confirmation for dangerous environments**
    - Modal prompt when running queries in UAT/Production
    - "You are about to run a query in VegaPay UAT. Continue?"

3. **Query history per environment**
    - Save query history tagged with environment
    - Filter history by environment

4. **Environment-specific color coding**
    - Border around query editor changes color based on environment
    - Red border for UAT, Yellow for staging, etc.

---

## When to Use Per-Tab Approach

Consider per-tab if:

- ✅ Users frequently need to compare data across environments
- ✅ You have read-only access to production (safe to have multiple contexts)
- ✅ Users are advanced DB administrators
- ✅ Different schemas across environments (need different queries)

Consider global approach if:

- ✅ **Safety is priority** (production access, destructive queries possible) ← **YOUR CASE**
- ✅ Single-environment sessions are the norm
- ✅ Users are not exclusively DB experts
- ✅ Simple, focused tool preferred

---

## Implementation Priority

### Phase 1 (Now) - Enhance Global Approach

1. ✅ Fix environment sync bug (completed)
2. Add environment/database indicator to query editor header
3. Add visual feedback when switching environments
4. Persist selected environment/database in localStorage

### Phase 2 (Later) - Safety Features

1. Confirmation modal for UAT/sensitive environments
2. Read-only mode toggle
3. Query validation/dry-run mode
4. Environment-based color coding

### Phase 3 (Future) - Advanced Features (if needed)

1. Query history with environment tagging
2. Saved queries/snippets per environment
3. Optional per-tab environment pinning (hybrid approach)
4. Multi-statement transaction support

---

## Conclusion

**Current global approach is CORRECT for your use case.**

The key issue was the synchronization bug (now fixed), not the architectural pattern.

Keep the global environment/database selection to maintain:

- Safety when working with production-like environments
- Simplicity for focused, single-context workflows
- Clear mental model of "I am working in THIS environment right now"

Add visual indicators and safety confirmations to enhance the experience without adding complexity.
