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
}

export type { QueryTab };

export interface QueryTabsRef {
    updateQuery: (query: string) => void;
    getActiveTab: () => QueryTab | undefined;
    updateTabEnvironment: (tabId: string, environment: string) => void;
    updateTabDatabase: (tabId: string, database: string) => void;
    toggleTabReadOnly: (tabId: string) => void;
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

const QueryTabs = forwardRef<QueryTabsRef, QueryTabsProps>(function QueryTabs(
    { globalDatabase, globalEnvironment, databases, onTabChange },
    ref,
) {
    const [tabs, setTabs] = useState<QueryTab[]>([
        {
            id: "1",
            name: "Playground 1",
            query: "SELECT version();",
            environment: globalEnvironment,
            database: globalDatabase,
            readOnly: false,
        },
    ]);
    console.log("🚀 ~ tabs:", tabs);
    const [activeTabId, setActiveTabId] = useState("1");
    const [nextTabId, setNextTabId] = useState(2);
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
        }),
        [activeTabId, activeTab, tabs],
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
                            padding: "4px",
                            borderRight: "1px solid white",
                        }}
                        title="Double-click to rename"
                    >
                        {tab.readOnly && "🔒 "}
                        {displayName}
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
                className="px-2 py-1 text-[14px] hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                title="New tab"
            >
                +
            </button>
        </div>
    );
});

export default QueryTabs;
