# pgLite Development Guide

Welcome to the pgLite feature development documentation! This guide will help you implement new features and improvements.

## 📁 Documentation Structure

```
docs/
├── ROADMAP.md                    # Complete feature roadmap with priorities
└── features/
    ├── 00-quick-wins.md          # 5 easy features (3-4 hours total)
    ├── 01-query-history.md       # Query history implementation
    └── 02-table-viewer.md        # Table data browser
```

## 🚀 Quick Start

### Recommended Implementation Order

**Phase 1: Quick Wins** (3-4 hours)

1. Execution Time Display (30 min)
2. Row Count Badge (15 min)
3. Connection Status (30 min)
4. Auto-save Tabs (1.5 hours)
5. SQL Formatter (1 hour)

**Phase 2: Professional Features** (8-10 hours)

1. Query History (2-3 hours) - See `features/01-query-history.md`
2. Table Data Viewer (3-4 hours) - See `features/02-table-viewer.md`
3. Column Sorting in Results (1-2 hours)
4. Search in Tree (1 hour)
5. Keyboard Shortcuts Panel (1 hour)

**Phase 3: Advanced** (20+ hours)

- Saved Queries & Snippets
- Query Explain
- Transaction Controls
- Multiple Connections
- And more! (see ROADMAP.md)

## 📋 Development Workflow

### For Each Feature:

1. **Read the documentation**
    - Feature overview
    - Implementation steps
    - Code examples
    - Testing checklist

2. **Set up your environment**

    ```bash
    npm install  # Install dependencies
    npm run dev  # Start development server
    ```

3. **Create necessary files**
    - Follow the file structure in the guide
    - Copy/adapt code snippets as needed

4. **Test thoroughly**
    - Use the testing checklist
    - Test edge cases
    - Verify localStorage persistence

5. **Commit your changes**
    ```bash
    git add .
    git commit -m "feat: add [feature name]"
    git push
    ```

## 🎯 Priority Matrix

| Feature           | Impact    | Effort | Priority | Status         |
| ----------------- | --------- | ------ | -------- | -------------- |
| Execution Time    | High      | Low    | 🔥 P0    | ⏳ Not Started |
| Row Count Badge   | High      | Low    | 🔥 P0    | ⏳ Not Started |
| Connection Status | Medium    | Low    | ⚡ P1    | ⏳ Not Started |
| Auto-save Tabs    | High      | Medium | ⚡ P1    | ⏳ Not Started |
| SQL Formatter     | Medium    | Low    | ⚡ P1    | ⏳ Not Started |
| Query History     | Very High | Medium | 🔥 P0    | ⏳ Not Started |
| Table Viewer      | Very High | Medium | 🔥 P0    | ⏳ Not Started |
| Column Sorting    | Medium    | Low    | ⚡ P1    | ⏳ Not Started |
| Search Tree       | Medium    | Low    | ⚡ P1    | ⏳ Not Started |
| Shortcuts Panel   | Low       | Low    | 💎 P2    | ⏳ Not Started |

**Legend**: 🔥 Must Have | ⚡ Should Have | 💎 Nice To Have

## 📦 Package Dependencies

### Already Installed

- `react`, `next` - Framework
- `pg` - PostgreSQL client
- `@monaco-editor/react` - Code editor
- `tailwindcss` - Styling

### To Install (as needed)

```bash
# Quick Wins
npm install sql-formatter              # SQL formatting

# Query History
npm install date-fns                   # Date formatting

# Advanced Features
npm install papaparse                  # CSV parsing
npm install react-dropzone             # File uploads
npm install reactflow                  # Schema diagrams
npm install openai                     # AI features
npm install zod                        # Validation
```

## 🗂️ Current Project Structure

```
pgLite/
├── app/
│   ├── page.tsx                      # Main application
│   ├── layout.tsx                    # Root layout
│   ├── globals.css                   # Global styles
│   └── api/
│       ├── query/route.ts            # Execute queries
│       ├── databases/route.ts        # List databases
│       ├── tables/route.ts           # List tables
│       └── columns/route.ts          # Get columns
├── components/
│   ├── DatabaseTree.tsx              # Sidebar tree
│   ├── QueryTabs.tsx                 # Multi-tab editor
│   ├── SQLEditor.tsx                 # Monaco editor
│   └── ResultsTable.tsx              # Results display
├── lib/
│   └── db.ts                         # Database connection
├── docs/
│   ├── ROADMAP.md                    # This roadmap
│   ├── STALE_CLOSURE_EXPLANATION.md  # Technical docs
│   └── features/                     # Implementation guides
├── .env.local.example                # Environment template
└── package.json                      # Dependencies
```

## 🛠️ Key Technical Patterns

### 1. State Management

```typescript
// Use refs to avoid stale closures
const selectedDatabaseRef = useRef<string>("");

useEffect(() => {
    selectedDatabaseRef.current = selectedDatabase;
}, [selectedDatabase]);
```

### 2. localStorage Persistence

```typescript
// Load on mount
useEffect(() => {
    const stored = localStorage.getItem("key");
    if (stored) setData(JSON.parse(stored));
}, []);

// Save on change (debounced)
useEffect(() => {
    const timeout = setTimeout(() => {
        localStorage.setItem("key", JSON.stringify(data));
    }, 500);
    return () => clearTimeout(timeout);
}, [data]);
```

### 3. API Routes

```typescript
// Always use POST for database operations
export async function POST(req: NextRequest) {
    const { query, database } = await req.json();

    // Create pool for specific database
    const pool = new Pool({ ...config, database });
    const client = await pool.connect();

    try {
        const result = await client.query(query);
        return NextResponse.json(result);
    } finally {
        client.release();
        await pool.end();
    }
}
```

### 4. Component Structure

```typescript
// Props interface
interface ComponentProps {
  data: DataType;
  onAction: (param: string) => void;
}

// Component with proper types
export default function Component({ data, onAction }: ComponentProps) {
  const [state, setState] = useState<StateType>(initialValue);

  return (
    <div className="tailwind-classes">
      {/* JSX */}
    </div>
  );
}
```

## 🧪 Testing Guidelines

### Manual Testing Checklist

For each feature:

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Responsive on mobile (optional for DB tools)
- [ ] Handles errors gracefully
- [ ] Shows loading states
- [ ] Persists across page refresh
- [ ] Works with empty data
- [ ] Works with large datasets
- [ ] Keyboard navigation works

### Edge Cases to Test

- Empty database (no tables)
- Very long table names
- Special characters in data
- NULL values
- Very wide result sets (>50 columns)
- Very long result sets (>10k rows)
- Syntax errors in SQL
- Connection loss during query
- localStorage quota exceeded

## 🎨 UI/UX Standards

### Color Palette

```css
Background: #030712 (gray-950)
Surface: #111827 (gray-900)
Border: #1f2937 (gray-800)
Text Primary: #f3f4f6 (gray-100)
Text Secondary: #9ca3af (gray-400)
Accent: #3b82f6 (blue-500)
Success: #10b981 (green-500)
Warning: #f59e0b (yellow-500)
Error: #ef4444 (red-500)
```

### Typography

- Headers: `font-semibold text-lg`
- Body: `text-sm`
- Code: `font-mono text-xs`
- Labels: `text-xs text-gray-500 uppercase`

### Spacing

- Section padding: `p-4`
- Card padding: `p-3`
- Element gap: `gap-2` or `gap-3`
- Border radius: `rounded-lg` (8px)

### Interactive Elements

- Buttons: `px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors`
- Inputs: `px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-blue-500`
- Disabled: `opacity-50 cursor-not-allowed`

## 📝 Code Style

### TypeScript

- Use strict typing
- Avoid `any` types
- Define interfaces for all data structures
- Use meaningful variable names
- Add JSDoc comments for complex functions

### React

- Functional components only
- Use hooks (useState, useEffect, useCallback, useRef)
- Extract reusable logic to custom hooks
- Keep components under 300 lines
- Use proper key props in lists

### Error Handling

```typescript
try {
    const result = await riskyOperation();
    setData(result);
    setError(null);
} catch (err) {
    console.error("Operation failed:", err);
    setError(err instanceof Error ? err.message : "Unknown error");
    // Optionally show toast notification
}
```

## 🚨 Security Considerations

1. **Never log credentials**

    ```typescript
    console.log("Connecting..."); // ✅ Good
    console.log({ password }); // ❌ Bad
    ```

2. **Sanitize SQL** (use parameterized queries when possible)

    ```typescript
    // ❌ Dangerous
    await query(`SELECT * FROM users WHERE id = ${userId}`);

    // ✅ Safe
    await query("SELECT * FROM users WHERE id = $1", [userId]);
    ```

3. **Confirm destructive operations**

    ```typescript
    if (confirm("Are you sure you want to delete?")) {
        // Proceed
    }
    ```

4. **Encrypt stored credentials** (for future multi-connection feature)
    ```typescript
    // Use Web Crypto API
    const encrypted = await crypto.subtle.encrypt(...);
    ```

## 🎓 Learning Resources

### PostgreSQL

- [Official Documentation](https://www.postgresql.org/docs/)
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)
- System catalogs: `pg_catalog`, `information_schema`

### Next.js

- [Next.js Docs](https://nextjs.org/docs)
- [App Router](https://nextjs.org/docs/app)
- [API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

### Monaco Editor

- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [Language Features](https://microsoft.github.io/monaco-editor/playground.html)

### TailwindCSS

- [Tailwind Docs](https://tailwindcss.com/docs)
- [Dark Mode](https://tailwindcss.com/docs/dark-mode)

## 💡 Tips & Tricks

### Debugging

```typescript
// Add to any API route for debugging
console.log("Request:", await req.json());
console.log("Environment:", process.env.PGHOST);
```

### Performance

- Use React.memo for expensive components
- Debounce frequent operations (search, autosave)
- Lazy load heavy components with `next/dynamic`
- Paginate large datasets
- Use indexes in PostgreSQL

### Development

- Keep dev server running with `npm run dev`
- Check browser console for errors
- Use React DevTools for state inspection
- Test in incognito to verify localStorage

## 📞 Getting Help

### Common Errors

**Error: "Please select a database"**

- Fix: Check selectedDatabaseRef is being used
- See: `STALE_CLOSURE_EXPLANATION.md`

**Error: "no pg_hba.conf entry"**

- Fix: Add SSL configuration
- See: `lib/db.ts`

**Error: "localStorage quota exceeded"**

- Fix: Implement data limits and cleanup
- Limit history to 100 items

**Monaco editor not loading**

- Fix: Check dynamic import in component
- Verify `@monaco-editor/react` is installed

## 🎯 Success Metrics

Track these as you add features:

- **User Time Saved**: Features that reduce manual work
- **Error Reduction**: Better error messages, validation
- **Feature Adoption**: localStorage can track usage
- **Performance**: Query execution time, page load time
- **Code Quality**: TypeScript coverage, component size

## 🚀 Deployment

When ready to deploy:

1. **Environment Variables**

    ```bash
    # Set in your hosting platform
    PGHOST=your-server.postgres.database.azure.com
    PGPORT=5432
    PGUSER=your-user
    PGPASSWORD=your-password
    PGDATABASE=postgres
    ```

2. **Build**

    ```bash
    npm run build
    npm start
    ```

3. **Hosting Options**
    - Vercel (recommended for Next.js)
    - Netlify
    - AWS Amplify
    - Self-hosted (Docker)

## 📈 Roadmap at a Glance

```
Now (Week 1-2)
  ├─ Quick Wins (5 features)
  └─ Query History

Next (Week 3-4)
  ├─ Table Data Viewer
  ├─ Column Sorting
  └─ Search in Tree

Future (Month 2)
  ├─ Saved Queries
  ├─ Query Explain
  └─ Transaction Controls

Vision (Month 3+)
  ├─ Multiple Connections
  ├─ Schema Visualization
  └─ AI Query Assistant
```

## ✅ Next Actions

To get started right now:

1. **Read** `docs/features/00-quick-wins.md`
2. **Install** `npm install sql-formatter date-fns`
3. **Implement** execution time display (30 min task)
4. **Test** with real queries
5. **Commit** your changes
6. **Move to next feature**

---

**Happy coding! 🎉**

Built with ❤️ for developers who love PostgreSQL
