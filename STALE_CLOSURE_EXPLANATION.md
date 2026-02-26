# React Stale Closure Bug: Deep Dive

## Table of Contents

1. [The Problem We Had](#the-problem-we-had)
2. [Understanding React State](#understanding-react-state)
3. [Understanding React Refs](#understanding-react-refs)
4. [What is a Stale Closure?](#what-is-a-stale-closure)
5. [Why Our Code Failed](#why-our-code-failed)
6. [The Solution](#the-solution)
7. [State vs Ref: When to Use Which](#state-vs-ref-when-to-use-which)
8. [Common Scenarios Where Stale Closures Occur](#common-scenarios-where-stale-closures-occur)
9. [Other Solutions](#other-solutions)
10. [Best Practices](#best-practices)

---

## The Problem We Had

### Symptom

When typing a SQL query and pressing Cmd/Ctrl+Enter, the backend returned:

```
"Database name is required"
```

Even though a database was clearly selected in the UI dropdown.

### Root Cause

The `runQuery` function was capturing an **old/stale value** of `selectedDatabase` due to JavaScript closures.

---

## Understanding React State

### What is State?

```tsx
const [selectedDatabase, setSelectedDatabase] = useState("");
```

State is:

- **Reactive**: When it changes, React re-renders the component
- **Immutable**: Each update creates a new value
- **Snapshot-based**: Each render gets a "snapshot" of state at that moment

### How State Works

```tsx
function Component() {
    const [count, setCount] = useState(0);

    console.log(count); // Render 1: 0, Render 2: 1, Render 3: 2

    const handleClick = () => {
        setCount(count + 1); // Uses count from THIS render
    };

    return <button onClick={handleClick}>Count: {count}</button>;
}
```

**Key Point**: Each render has its own "version" of `count`.

---

## Understanding React Refs

### What is a Ref?

```tsx
const selectedDatabaseRef = useRef("");
```

A ref is:

- **Mutable**: You can change `.current` without re-rendering
- **Persistent**: Same object across all renders
- **Not reactive**: Changing it doesn't trigger re-renders
- **Always current**: Reading `.current` gives you the latest value

### How Refs Work

```tsx
function Component() {
    const countRef = useRef(0);

    const handleClick = () => {
        countRef.current += 1; // Mutates the ref
        console.log(countRef.current); // Always shows current value
        // No re-render happens!
    };

    return <button onClick={handleClick}>Click me</button>;
}
```

**Key Point**: `countRef.current` always points to the same memory location.

---

## What is a Stale Closure?

### JavaScript Closures Refresher

A closure is when a function "remembers" variables from its creation scope:

```javascript
function makeCounter() {
    let count = 0; // This variable is "closed over"

    return function () {
        count++; // This function remembers 'count'
        return count;
    };
}

const counter = makeCounter();
counter(); // 1
counter(); // 2
```

### Stale Closure

A **stale closure** happens when a function remembers an **old value** because it was created with that value in scope.

```tsx
function Component() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            console.log(count); // STALE! Always logs 0
        }, 1000);

        return () => clearInterval(interval);
    }, []); // Empty deps = closure created only once with count=0

    return <button onClick={() => setCount((c) => c + 1)}>Increment</button>;
}
```

Even though `count` changes to 1, 2, 3..., the interval function only "knows" `count = 0` because that's what existed when it was created.

---

## Why Our Code Failed

### Original Code

```tsx
const [selectedDatabase, setSelectedDatabase] = useState("");

const runQuery = useCallback(
    async (query: string) => {
        // selectedDatabase is captured HERE
        const res = await fetch("/api/query", {
            body: JSON.stringify({
                query,
                database: selectedDatabase, // ❌ Uses captured value
            }),
        });
    },
    [selectedDatabase], // Function recreated when this changes
);

// This gets called ONCE when Monaco editor mounts
<SQLEditor onRunQuery={runQuery} />;
```

### Timeline of Events

1. **Initial Render** (App loads)

    ```
    selectedDatabase = ""
    runQuery function created with selectedDatabase = ""
    runQuery passed to Monaco editor
    ```

2. **User Selects Database** (e.g., "account_management")

    ```
    selectedDatabase = "account_management"
    runQuery function RECREATED with selectedDatabase = "account_management"
    New runQuery passed to Monaco editor component
    ```

3. **BUT Monaco Editor is Lazy Loaded!**

    ```tsx
    const QueryTabs = dynamic(() => import("@/components/QueryTabs"), {
        ssr: false,
    });
    ```

    Because it's dynamically imported and the editor mounts asynchronously, it might have registered the keyboard shortcut with the FIRST version of `runQuery` (where `selectedDatabase = ""`).

4. **User Types Query and Presses Cmd+Enter**
    ```
    Monaco editor calls the runQuery it has stored
    That function has selectedDatabase = ""
    Server receives database: ""
    Server responds: "Database name is required"
    ```

### Why useCallback Didn't Help

```tsx
const runQuery = useCallback(
    async (query) => {
        // This function is recreated when selectedDatabase changes
        // BUT Monaco already has the old reference
    },
    [selectedDatabase],
);
```

Even though the function is recreated, Monaco editor's keyboard shortcut handler **already stored** the previous version and doesn't automatically update.

---

## The Solution

### Using a Ref to Always Get Current Value

```tsx
// 1. Create a ref
const selectedDatabaseRef = useRef<string>("");

// 2. Keep ref synchronized with state
useEffect(() => {
    selectedDatabaseRef.current = selectedDatabase;
}, [selectedDatabase]);

// 3. Read from ref instead of closure
const runQuery = useCallback(
    async (query: string) => {
        const currentDatabase = selectedDatabaseRef.current; // ✅ Always current!

        const res = await fetch("/api/query", {
            body: JSON.stringify({
                query,
                database: currentDatabase,
            }),
        });
    },
    [], // No dependencies! Function never recreated
);
```

### Why This Works

```
Time →

Render 1:
  selectedDatabase state = ""
  selectedDatabaseRef.current = ""
  runQuery created (reads from ref)

User selects "account_management":

Render 2:
  selectedDatabase state = "account_management"
  useEffect runs → selectedDatabaseRef.current = "account_management"
  runQuery is NOT recreated (no deps)
  Monaco still has same runQuery reference ✅

User presses Cmd+Enter:
  runQuery executes
  Reads selectedDatabaseRef.current
  Gets "account_management" ✅
```

The **same function instance** is used, but it reads the **latest value** from the ref.

---

## State vs Ref: When to Use Which

### Use State When:

✅ **You need to trigger re-renders**

```tsx
const [count, setCount] = useState(0);
return <div>{count}</div>; // Shows on screen
```

✅ **You need React to respond to changes**

```tsx
const [isOpen, setIsOpen] = useState(false);
return (
    <Modal show={isOpen}>
        <button onClick={() => setIsOpen(false)}>Close</button>
    </Modal>
);
```

✅ **Data drives the UI**

```tsx
const [items, setItems] = useState([]);
return items.map((item) => <Item key={item.id} {...item} />);
```

### Use Ref When:

✅ **You need to persist values across renders WITHOUT re-rendering**

```tsx
const renderCountRef = useRef(0);
useEffect(() => {
    renderCountRef.current += 1; // No re-render triggered
});
```

✅ **You need to store DOM references**

```tsx
const inputRef = useRef<HTMLInputElement>(null);
const focus = () => inputRef.current?.focus();
```

✅ **You need to access latest values in callbacks/timers**

```tsx
const latestDataRef = useRef(data);
useEffect(() => {
    latestDataRef.current = data;
}, [data]);

useEffect(() => {
    const interval = setInterval(() => {
        console.log(latestDataRef.current); // Always latest!
    }, 1000);
    return () => clearInterval(interval);
}, []);
```

✅ **You need to store previous values**

```tsx
const prevValueRef = useRef();
useEffect(() => {
    prevValueRef.current = value;
});
```

### Comparison Table

| Feature                 | State             | Ref                  |
| ----------------------- | ----------------- | -------------------- |
| Triggers re-render      | ✅ Yes            | ❌ No                |
| Mutable                 | ❌ No (immutable) | ✅ Yes               |
| Persists across renders | ✅ Yes            | ✅ Yes               |
| Can be used in JSX      | ✅ Yes            | ⚠️ Only for DOM refs |
| Synchronous updates     | ❌ No (batched)   | ✅ Yes (immediate)   |
| Reset on unmount        | ✅ Yes            | ✅ Yes               |

---

## Common Scenarios Where Stale Closures Occur

### 1. Event Listeners

❌ **Problem:**

```tsx
function Component() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const handleClick = () => {
            console.log(count); // Stale! Always 0
        };

        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, []); // count not in deps

    return (
        <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
    );
}
```

✅ **Solution 1: Add to dependencies**

```tsx
useEffect(() => {
    const handleClick = () => {
        console.log(count); // Fresh value
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
}, [count]); // Recreates listener on change
```

✅ **Solution 2: Use ref**

```tsx
const countRef = useRef(count);
useEffect(() => {
    countRef.current = count;
}, [count]);

useEffect(() => {
    const handleClick = () => {
        console.log(countRef.current); // Always current
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
}, []); // Only set up once
```

### 2. setInterval / setTimeout

❌ **Problem:**

```tsx
function Timer() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCount(count + 1); // count is always 0!
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return <div>{count}</div>;
}
```

✅ **Solution: Use functional update**

```tsx
useEffect(() => {
    const interval = setInterval(() => {
        setCount((c) => c + 1); // Uses latest value
    }, 1000);

    return () => clearInterval(interval);
}, []);
```

### 3. Third-party Libraries (Monaco, Chart.js, etc.)

❌ **Problem:**

```tsx
function Editor() {
    const [setting, setSetting] = useState("light");

    const handleSave = useCallback(() => {
        api.save({ theme: setting }); // Stale setting
    }, []); // Empty deps

    useEffect(() => {
        monaco.editor.addCommand(KeyCode.Save, handleSave);
    }, []);
}
```

✅ **Solution: Use ref**

```tsx
const settingRef = useRef(setting);
useEffect(() => {
    settingRef.current = setting;
}, [setting]);

const handleSave = useCallback(() => {
    api.save({ theme: settingRef.current }); // Current setting
}, []);
```

### 4. WebSocket / Event Emitter Callbacks

❌ **Problem:**

```tsx
function Chat() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        socket.on("message", (msg) => {
            console.log(`${user?.name} received: ${msg}`); // Stale user
        });
    }, []);
}
```

✅ **Solution:**

```tsx
const userRef = useRef(user);
useEffect(() => {
    userRef.current = user;
}, [user]);

useEffect(() => {
    socket.on("message", (msg) => {
        console.log(`${userRef.current?.name} received: ${msg}`);
    });
}, []);
```

### 5. Outside Click Handlers

❌ **Problem:**

```tsx
function Dropdown() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = () => {
            if (isOpen) {
                // Stale isOpen
                setIsOpen(false);
            }
        };

        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);
}
```

✅ **Solution:**

```tsx
const isOpenRef = useRef(isOpen);
useEffect(() => {
    isOpenRef.current = isOpen;
}, [isOpen]);

useEffect(() => {
    const handleClickOutside = () => {
        if (isOpenRef.current) {
            setIsOpen(false);
        }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
}, []);
```

---

## Other Solutions

### 1. Include All Dependencies (Not Always Ideal)

```tsx
const runQuery = useCallback(
    async (query: string) => {
        const res = await fetch("/api/query", {
            body: JSON.stringify({ query, database: selectedDatabase }),
        });
    },
    [selectedDatabase], // ✅ Recreates function on change
);
```

**Pros:**

- Simple and obvious
- ESLint will not complain

**Cons:**

- Function recreated on every change
- Child components re-render unnecessarily
- Event listeners/timers need cleanup and re-registration

### 2. Functional Updates (For State Setters)

```tsx
// Instead of:
setCount(count + 1); // Stale count

// Use:
setCount((c) => c + 1); // c is always current
```

**When to use:** When you only need to update state based on previous state, not read it.

### 3. useReducer (Better for Complex State)

```tsx
const [state, dispatch] = useReducer(reducer, initialState);

// Actions can be dispatched from anywhere
const handleSave = useCallback(() => {
    dispatch({ type: "SAVE", payload: data });
}, []); // No dependencies on state values
```

### 4. Custom Hook for Latest Value

```tsx
function useLatest<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}

// Usage:
const latestDatabase = useLatest(selectedDatabase);

const runQuery = useCallback(async (query) => {
    const database = latestDatabase.current; // Always current
}, []);
```

---

## Best Practices

### 1. **Trust ESLint's exhaustive-deps rule**

```tsx
// ESLint will warn:
const callback = useCallback(() => {
    console.log(someValue); // ⚠️  someValue not in deps
}, []);
```

Either:

- Add `someValue` to dependencies
- Use a ref if you don't want to recreate the function

### 2. **Use refs for "instance variables"**

Things that don't affect rendering:

- Timer IDs
- Animation frame IDs
- Previous values
- DOM references
- Third-party library instances

```tsx
const timeoutIdRef = useRef<number>();
const previousValueRef = useRef(value);
const chartInstanceRef = useRef<Chart>();
```

### 3. **Combine state + ref when needed**

```tsx
const [value, setValue] = useState(0);
const valueRef = useRef(value);

useEffect(() => {
    valueRef.current = value; // Keep in sync
}, [value]);

// Now you have:
// - value: for rendering
// - valueRef.current: for callbacks/timers
```

### 4. **Document why you're using refs**

```tsx
// Good: Explains the 'why'
// Using ref to avoid recreating WebSocket listener on every state change
const userRef = useRef(user);
useEffect(() => {
    userRef.current = user;
}, [user]);
```

### 5. **Be careful with || and && operators on refs**

```tsx
// ❌ Bad: Creates new object on every render
<Component data={dataRef.current || {}} />;

// ✅ Good: Memoize or use state for defaults
const defaultData = useMemo(() => ({}), []);
<Component data={dataRef.current || defaultData} />;
```

### 6. **Test for stale closures**

Add console.logs in callbacks:

```tsx
const handleClick = useCallback(() => {
    console.log("Value at click:", value); // Check if stale
}, []);
```

---

## Summary

| Concept               | Key Takeaway                                           |
| --------------------- | ------------------------------------------------------ |
| **Stale Closure**     | Function remembers old values from when it was created |
| **State**             | Triggers re-renders, each render gets a snapshot       |
| **Ref**               | Mutable container, always points to latest value       |
| **When to use Ref**   | Callbacks, timers, third-party libs, DOM access        |
| **When to use State** | Anything that affects the UI                           |
| **Best Practice**     | Trust ESLint, document refs, combine when needed       |

### Our Specific Fix

```tsx
// ❌ Before: Closure captured old selectedDatabase
const runQuery = useCallback(
    async (query) => {
        fetch("/api/query", {
            body: JSON.stringify({ query, database: selectedDatabase }),
        });
    },
    [selectedDatabase],
);

// ✅ After: Always reads current value from ref
const selectedDatabaseRef = useRef("");
useEffect(() => {
    selectedDatabaseRef.current = selectedDatabase;
}, [selectedDatabase]);

const runQuery = useCallback(async (query) => {
    fetch("/api/query", {
        body: JSON.stringify({ query, database: selectedDatabaseRef.current }),
    });
}, []);
```

**Result:** Monaco editor's keyboard shortcut always uses the currently selected database! 🎉

---

## Further Reading

- [React Docs: useRef](https://react.dev/reference/react/useRef)
- [React Docs: useState](https://react.dev/reference/react/useState)
- [Overreacted: Making setInterval Declarative with React Hooks](https://overreacted.io/making-setinterval-declarative-with-react-hooks/)
- [Kent C. Dodds: How to optimize your context value](https://kentcdodds.com/blog/how-to-optimize-your-context-value)
