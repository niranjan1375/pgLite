"use client";

import {
    useState,
    useEffect,
    forwardRef,
    useImperativeHandle,
    useRef,
} from "react";
import { environments } from "@/lib/environments";
import { getEnvironmentColor } from "@/lib/design-system";
import { useKeyboard } from "@/hooks/useKeyboard";

interface QueryTab {
    id: string;
    name: string;
    query: string;
    environment: string;
    database: string;
    readOnly: boolean;
    mode?: "standard" | "workspace"; // workspace mode auto-routes to DB based on table prefix
    templateName?: string;
}

export type { QueryTab };

export interface QueryTabsRef {
    updateQuery: (query: string) => void;
    getActiveTab: () => QueryTab | undefined;
    updateTabEnvironment: (tabId: string, environment: string) => void;
    updateTabDatabase: (tabId: string, database: string) => void;
    toggleTabReadOnly: (tabId: string) => void;
    openWorkspaceTab: (options: {
        name: string;
        content: string;
        environment: string;
    }) => void;
    setActiveTabTemplateName: (templateName: string) => void;
}

interface QueryTabsProps {
    globalDatabase: string;
    globalEnvironment: string;
    databases: string[];
    onTabChange?: (tab: QueryTab) => void;
}

// Helper to generate dynamic tab name
function generateTabName(environment: string, database: string): string {
    const envName = environments[environment]?.name || environment;
    const shortEnv = envName.split(" ")[0]; // Take first word (Loadtest, Sandbox, etc.)
    const shortDb = database.split("_")[0]; // Take first part before underscore
    return `${shortEnv} • ${shortDb}`;
}

// LocalStorage key for tabs
const TABS_STORAGE_KEY = "pgLite_queryTabs";
const ACTIVE_TAB_STORAGE_KEY = "pgLite_activeTabId";

// Load tabs from localStorage
function loadTabsFromStorage(
    globalEnvironment: string,
    globalDatabase: string,
): QueryTab[] {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(TABS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (error) {
        console.error("Failed to load tabs from localStorage:", error);
    }

    // Default tab if nothing in storage
    return [
        {
            id: "1",
            name: "Playground 1",
            query: "SELECT version();",
            environment: globalEnvironment,
            database: globalDatabase,
            readOnly: false,
        },
    ];
}

// Save tabs to localStorage
function saveTabsToStorage(tabs: QueryTab[]) {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
    } catch (error) {
        console.error("Failed to save tabs to localStorage:", error);
    }
}

// Load active tab ID from localStorage
function loadActiveTabId(loadedTabs: QueryTab[]): string {
    if (typeof window === "undefined") return loadedTabs[0]?.id || "1";

    try {
        const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        if (stored && loadedTabs.some((t) => t.id === stored)) {
            return stored;
        }
    } catch (error) {
        console.error("Failed to load active tab ID:", error);
    }

    return loadedTabs[0]?.id || "1";
}

// Save active tab ID to localStorage
function saveActiveTabId(tabId: string) {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabId);
    } catch (error) {
        console.error("Failed to save active tab ID:", error);
    }
}

const QueryTabs = forwardRef<QueryTabsRef, QueryTabsProps>(function QueryTabs(
    { globalDatabase, globalEnvironment, databases, onTabChange },
    ref,
) {
    const [tabs, setTabs] = useState<QueryTab[]>(() =>
        loadTabsFromStorage(globalEnvironment, globalDatabase),
    );
    const [activeTabId, setActiveTabId] = useState(() => {
        const loadedTabs = loadTabsFromStorage(
            globalEnvironment,
            globalDatabase,
        );
        return loadActiveTabId(loadedTabs);
    });
    const [nextTabId, setNextTabId] = useState(() => {
        const loadedTabs = loadTabsFromStorage(
            globalEnvironment,
            globalDatabase,
        );
        const maxId = Math.max(
            ...loadedTabs.map((t) => parseInt(t.id) || 0),
            0,
        );
        return maxId + 1;
    });
    const lastNotifiedTabRef = useRef<{
        id: string;
        environment: string;
        database: string;
        readOnly: boolean;
    } | null>(null);

    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

    // Keyboard shortcuts for tabs
    useKeyboard([
        {
            key: "t",
            ctrl: true,
            description: "New tab",
            handler: () => {
                const newTab: QueryTab = {
                    id: String(nextTabId),
                    name: `Playground ${nextTabId}`,
                    query: "",
                    environment: globalEnvironment,
                    database: globalDatabase,
                    readOnly: false,
                };
                setTabs([...tabs, newTab]);
                setActiveTabId(String(nextTabId));
                setNextTabId(nextTabId + 1);
            },
        },
        {
            key: "w",
            ctrl: true,
            description: "Close tab",
            handler: () => {
                if (tabs.length > 1) {
                    const newTabs = tabs.filter((t) => t.id !== activeTabId);
                    setTabs(newTabs);
                    if (newTabs.length > 0) {
                        setActiveTabId(newTabs[0].id);
                    }
                }
            },
        },
    ]);

    // Save tabs to localStorage whenever they change
    useEffect(() => {
        saveTabsToStorage(tabs);
    }, [tabs]);

    // Save active tab ID to localStorage whenever it changes
    useEffect(() => {
        saveActiveTabId(activeTabId);
    }, [activeTabId]);

    // Notify parent when active tab changes (but not when query changes)
    useEffect(() => {
        if (activeTab && onTabChange) {
            const currentState = {
                id: activeTab.id,
                environment: activeTab.environment,
                database: activeTab.database,
                readOnly: activeTab.readOnly,
            };

            // Only notify if something actually changed
            const lastNotified = lastNotifiedTabRef.current;
            if (
                !lastNotified ||
                lastNotified.id !== currentState.id ||
                lastNotified.environment !== currentState.environment ||
                lastNotified.database !== currentState.database ||
                lastNotified.readOnly !== currentState.readOnly
            ) {
                lastNotifiedTabRef.current = currentState;
                onTabChange(activeTab);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activeTab?.id,
        activeTab?.environment,
        activeTab?.database,
        activeTab?.readOnly,
    ]);

    // Expose methods to parent via ref
    useImperativeHandle(
        ref,
        () => ({
            updateQuery: (query: string) => {
                setTabs((prevTabs) =>
                    prevTabs.map((t) =>
                        t.id === activeTabId ? { ...t, query } : t,
                    ),
                );
            },
            getActiveTab: () => activeTab,
            updateTabEnvironment: (tabId: string, environment: string) => {
                setTabs((prevTabs) =>
                    prevTabs.map((t) => {
                        if (t.id === tabId) {
                            const updatedTab = { ...t, environment };
                            // Update name if it's a default Playground name
                            if (t.name.startsWith("Playground ")) {
                                updatedTab.name = generateTabName(
                                    environment,
                                    t.database,
                                );
                            }
                            return updatedTab;
                        }
                        return t;
                    }),
                );
            },
            updateTabDatabase: (tabId: string, database: string) => {
                setTabs((prevTabs) =>
                    prevTabs.map((t) => {
                        if (t.id === tabId) {
                            const updatedTab = { ...t, database };
                            // Update name if it's a default Playground name
                            if (t.name.startsWith("Playground ")) {
                                updatedTab.name = generateTabName(
                                    t.environment,
                                    database,
                                );
                            }
                            return updatedTab;
                        }
                        return t;
                    }),
                );
            },
            toggleTabReadOnly: (tabId: string) => {
                setTabs(
                    tabs.map((t) =>
                        t.id === tabId ? { ...t, readOnly: !t.readOnly } : t,
                    ),
                );
            },
            openWorkspaceTab: ({ name, content, environment }) => {
                const tabId = String(nextTabId);
                const cleanName = name.endsWith(".sql")
                    ? name.slice(0, -4)
                    : name;

                const newTab: QueryTab = {
                    id: tabId,
                    name: cleanName,
                    query: content,
                    environment,
                    database: "",
                    readOnly: false,
                    mode: "workspace",
                    templateName: name,
                };

                setTabs((prevTabs) => [...prevTabs, newTab]);
                setActiveTabId(tabId);
                setNextTabId((prev) => prev + 1);
            },
            setActiveTabTemplateName: (templateName: string) => {
                const cleanName = templateName.endsWith(".sql")
                    ? templateName.slice(0, -4)
                    : templateName;

                setTabs((prevTabs) =>
                    prevTabs.map((tab) =>
                        tab.id === activeTabId
                            ? {
                                  ...tab,
                                  templateName,
                                  name:
                                      tab.mode === "workspace"
                                          ? cleanName
                                          : tab.name,
                              }
                            : tab,
                    ),
                );
            },
        }),
        [activeTabId, activeTab, tabs, nextTabId],
    );

    // Update tab name when environment or database changes
    const updateTabName = (tab: QueryTab) => {
        // If tab has default name (Playground X), update it dynamically
        if (tab.name.startsWith("Playground")) {
            return generateTabName(tab.environment, tab.database);
        }
        // Otherwise keep custom name
        return tab.name;
    };

    const addTab = () => {
        const newTab: QueryTab = {
            id: String(nextTabId),
            name: `Playground ${nextTabId}`,
            query: "",
            environment: globalEnvironment,
            database: globalDatabase,
            readOnly: false,
            mode: "standard",
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(String(nextTabId));
        setNextTabId(nextTabId + 1);
    };

    const addWorkspaceTab = () => {
        const newTab: QueryTab = {
            id: String(nextTabId),
            name: `Workspace ${nextTabId}`,
            query: "-- Workspace Mode: Use db_name.table_name syntax\n-- Example: SELECT * FROM my_db.users;\n\n",
            environment: globalEnvironment,
            database: "", // Not needed in workspace mode
            readOnly: false,
            mode: "workspace",
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(String(nextTabId));
        setNextTabId(nextTabId + 1);
    };

    const closeTab = (tabId: string) => {
        const newTabs = tabs.filter((t) => t.id !== tabId);
        setTabs(newTabs);
        if (activeTabId === tabId && newTabs.length > 0) {
            setActiveTabId(newTabs[0].id);
        }
    };

    const renameTab = (tabId: string) => {
        const name = window.prompt("Rename tab:");
        if (name) {
            setTabs(tabs.map((t) => (t.id === tabId ? { ...t, name } : t)));
        }
    };

    // Auto-select first database when databases list becomes available
    useEffect(() => {
        if (
            databases.length > 0 &&
            activeTab &&
            !activeTab.database &&
            activeTab.id === activeTabId
        ) {
            setTabs((prevTabs) =>
                prevTabs.map((t) =>
                    t.id === activeTab.id
                        ? {
                              ...t,
                              database: databases[0],
                              name: t.name.startsWith("Playground ")
                                  ? generateTabName(t.environment, databases[0])
                                  : t.name,
                          }
                        : t,
                ),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [databases.length, activeTab?.database, activeTabId]);

    return (
        <div
            className="flex items-center gap-2 h-[36px] px-2"
            style={{ background: "var(--panel)" }}
        >
            {/* Tabs */}
            {tabs.map((tab) => {
                const displayName = updateTabName(tab);
                const isActive = activeTabId === tab.id;
                const envColor = getEnvironmentColor(tab.environment);

                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        onDoubleClick={() => renameTab(tab.id)}
                        className="relative px-3 py-1.5 text-[12px] uppercase tracking-wide transition-colors hover:opacity-80 border"
                        style={{
                            color: isActive ? envColor : "var(--text-muted)",
                            background: isActive ? "var(--bg)" : "transparent",
                            borderColor: isActive ? envColor : "transparent",
                            borderBottomColor: isActive
                                ? envColor
                                : "transparent",
                            paddingTop: "6px",
                            paddingBottom: "6px",
                            paddingLeft: "12px",
                            paddingRight: "12px",
                            borderRight: "1px solid var(--border)",
                        }}
                        title="Double-click to rename"
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            {tab.readOnly && (
                                <span
                                    className="px-1 text-[9px] border rounded"
                                    style={{ borderColor: "var(--border)" }}
                                >
                                    RO
                                </span>
                            )}
                            {tab.mode === "workspace" && (
                                <span
                                    className="px-1 text-[9px] border rounded"
                                    style={{
                                        color: "var(--accent)",
                                        borderColor: "var(--accent)",
                                    }}
                                >
                                    WS
                                </span>
                            )}
                            <span>{displayName}</span>
                        </span>
                        {isActive && (
                            <div
                                className="absolute bottom-0 left-0 right-0 h-[2px]"
                                style={{ background: envColor }}
                            />
                        )}
                        {tabs.length > 1 && isActive && (
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab(tab.id);
                                }}
                                className="ml-2 hover:opacity-60"
                            >
                                ×
                            </span>
                        )}
                    </button>
                );
            })}

            {/* Add Tab */}
            <button
                onClick={addTab}
                className="px-3 py-1 text-[14px] hover:opacity-80 transition-opacity"
                style={{
                    color: "var(--text-muted)",
                    marginLeft: "4px",
                }}
                title="New standard tab (⌘T)"
            >
                +
            </button>

            {/* Add Workspace Tab */}
            <button
                onClick={addWorkspaceTab}
                className="px-3 py-1 text-[11px] font-medium hover:opacity-80 transition-all border rounded"
                style={{
                    color: "var(--accent)",
                    borderColor: "var(--accent)",
                    background: "rgba(59, 130, 246, 0.05)",
                    marginLeft: "4px",
                }}
                title="New workspace tab (auto-routes to DB based on table prefix)"
            >
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                    }}
                >
                    <span>WS</span>
                </span>
            </button>
        </div>
    );
});

export default QueryTabs;
