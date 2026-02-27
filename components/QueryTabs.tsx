"use client";

import {
    useState,
    useEffect,
    forwardRef,
    useImperativeHandle,
    useRef,
} from "react";
import { environments, getAllEnvironments } from "@/lib/environments";

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
    const [activeTabId, setActiveTabId] = useState("1");
    const [nextTabId, setNextTabId] = useState(2);
    const lastNotifiedTabRef = useRef<{
        id: string;
        environment: string;
        database: string;
        readOnly: boolean;
    } | null>(null);

    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
    const availableEnvironments = getAllEnvironments();

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
        }),
        [activeTabId, activeTab],
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

    const updateTabEnvironment = (tabId: string, environment: string) => {
        setTabs(
            tabs.map((t) => {
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
    };

    const updateTabDatabase = (tabId: string, database: string) => {
        setTabs(
            tabs.map((t) => {
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
    };

    const toggleReadOnly = (tabId: string) => {
        setTabs(
            tabs.map((t) =>
                t.id === tabId ? { ...t, readOnly: !t.readOnly } : t,
            ),
        );
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
            updateTabDatabase(activeTab.id, databases[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [databases.length, activeTab?.database, activeTabId]);

    return (
        <div className="flex flex-col bg-gray-900">
            {/* Tab Bar */}
            <div className="flex items-center gap-0.5 px-3 pt-3 border-b border-gray-800 overflow-x-auto bg-gray-950">
                {/* Compact Branding */}
                <div className="flex items-center gap-2 mr-4 px-2 py-1 text-blue-400">
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34l2 2H4v12h12v-5.34l2-2z" />
                        <path d="M18.71 8.21c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.47-.47-1.12-.29-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        <path d="M8 13.41V15h1.59l4.83-4.83-1.59-1.59L8 13.41z" />
                    </svg>
                    <span className="text-sm font-semibold tracking-tight">
                        pgLite
                    </span>
                </div>
                {tabs.map((tab) => {
                    const displayName = updateTabName(tab);
                    const envColor =
                        tab.environment === "vegapay-uat" ||
                        tab.environment === "vegapay-uat-snapshot" ||
                        tab.environment === "unity-uat"
                            ? "text-amber-400"
                            : tab.environment === "staging"
                              ? "text-orange-400"
                              : "text-cyan-400";

                    return (
                        <div
                            key={tab.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-t text-sm
                                       transition-colors group relative min-w-[120px]
                                       ${
                                           activeTabId === tab.id
                                               ? "bg-gray-900 text-gray-100 border-t border-l border-r border-gray-800 -mb-px"
                                               : "bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-300 border-t border-l border-r border-transparent"
                                       }`}
                        >
                            {tab.readOnly && (
                                <svg
                                    className="w-3 h-3 text-amber-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                </svg>
                            )}
                            <button
                                onClick={() => setActiveTabId(tab.id)}
                                onDoubleClick={() => renameTab(tab.id)}
                                className={`flex-1 whitespace-nowrap ${activeTabId === tab.id ? envColor : ""}`}
                                title="Double-click to rename"
                            >
                                {displayName}
                            </button>
                            {tabs.length > 1 && (
                                <button
                                    onClick={() => closeTab(tab.id)}
                                    className="p-0.5 rounded hover:bg-gray-700 text-gray-500
                                               hover:text-gray-300 transition-colors"
                                    title="Close tab"
                                >
                                    <svg
                                        className="w-3.5 h-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            )}
                        </div>
                    );
                })}
                <button
                    onClick={addTab}
                    className="p-1.5 rounded text-gray-500 hover:bg-gray-800
                               hover:text-gray-300 transition-colors ml-1"
                    title="New tab"
                >
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                </button>
            </div>
            {/* Tab Controls: Environment, Database, Read-Only */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800">
                {/* Environment Selector */}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">
                        Environment:
                    </label>
                    <select
                        value={activeTab.environment}
                        onChange={(e) =>
                            updateTabEnvironment(activeTab.id, e.target.value)
                        }
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {availableEnvironments.map((env) => (
                            <option key={env} value={env}>
                                {environments[env]?.name || env}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Database Selector */}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Database:</label>
                    <select
                        value={activeTab.database || ""}
                        onChange={(e) => {
                            updateTabDatabase(activeTab.id, e.target.value);
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {databases.map((db) => (
                            <option key={db} value={db}>
                                {db}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Read-Only Toggle */}
                <button
                    onClick={() => toggleReadOnly(activeTab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                        activeTab.readOnly
                            ? "bg-amber-900/30 text-amber-400 border border-amber-700"
                            : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
                    }`}
                    title={
                        activeTab.readOnly
                            ? "Read-only mode enabled"
                            : "Enable read-only mode"
                    }
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        {activeTab.readOnly ? (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        ) : (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                            />
                        )}
                    </svg>
                    {activeTab.readOnly ? "Read-only" : "Write mode"}
                </button>
            </div>
        </div>
    );
});

export default QueryTabs;
