"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const SQLEditor = dynamic(() => import("@/components/SQLEditor"), {
    ssr: false,
});

interface Column {
    name: string;
    type: string;
    nullable: string;
}

interface QueryTab {
    id: string;
    name: string;
    query: string;
}

interface QueryTabsProps {
    tableColumns: Record<string, Column[]>;
    onRunQuery: (query: string) => void;
    loading: boolean;
    selectedDatabase: string;
    selectedEnvironment: string;
}

export default function QueryTabs({
    tableColumns,
    onRunQuery,
    loading,
    selectedDatabase,
    selectedEnvironment,
}: QueryTabsProps) {
    const [tabs, setTabs] = useState<QueryTab[]>([
        { id: "1", name: "Query 1", query: "SELECT version();" },
    ]);
    const [activeTabId, setActiveTabId] = useState("1");
    const [nextTabId, setNextTabId] = useState(2);

    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

    const addTab = () => {
        const newTab: QueryTab = {
            id: String(nextTabId),
            name: `Playground ${nextTabId}`,
            query: "",
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);
        setNextTabId(nextTabId + 1);
    };

    const closeTab = (tabId: string) => {
        if (tabs.length === 1) return; // Keep at least one tab

        const tabIndex = tabs.findIndex((t) => t.id === tabId);
        const newTabs = tabs.filter((t) => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            const newActiveTab =
                newTabs[Math.max(0, tabIndex - 1)] || newTabs[0];
            setActiveTabId(newActiveTab.id);
        }
    };

    const updateTabQuery = (tabId: string, query: string) => {
        setTabs(tabs.map((t) => (t.id === tabId ? { ...t, query } : t)));
    };

    const renameTab = (tabId: string) => {
        const newName = prompt("Enter tab name:");
        if (newName && newName.trim()) {
            setTabs(
                tabs.map((t) =>
                    t.id === tabId ? { ...t, name: newName.trim() } : t,
                ),
            );
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Tab Bar */}
            <div className="flex items-center gap-0.5 px-3 pt-3 border-b border-gray-800 overflow-x-auto bg-gray-950">
                {tabs.map((tab) => (
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
                        <button
                            onClick={() => setActiveTabId(tab.id)}
                            onDoubleClick={() => renameTab(tab.id)}
                            className="flex-1 whitespace-nowrap"
                            title="Double-click to rename"
                        >
                            {tab.name}
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
                ))}
                <button
                    onClick={addTab}
                    className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800
                               rounded transition-colors"
                    title="New query"
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

            {/* Editor Content */}
            <div className="flex-1 flex flex-col p-4 bg-gray-900">
                {/* Context Indicator Bar */}
                <div className="mb-3 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <svg
                            className="w-4 h-4 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                            />
                        </svg>
                        <span className="text-xs text-gray-400">
                            Environment:
                        </span>
                        <span className="text-xs font-semibold text-cyan-400">
                            {selectedEnvironment
                                .split("-")
                                .map(
                                    (word) =>
                                        word.charAt(0).toUpperCase() +
                                        word.slice(1),
                                )
                                .join(" ")}
                        </span>
                    </div>
                    {selectedDatabase && (
                        <>
                            <div className="w-px h-4 bg-gray-700" />
                            <div className="flex items-center gap-2">
                                <svg
                                    className="w-4 h-4 text-gray-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                                    />
                                </svg>
                                <span className="text-xs text-gray-400">
                                    Database:
                                </span>
                                <span className="text-xs font-semibold text-green-400">
                                    {selectedDatabase}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-400">
                            SQL Editor
                        </label>
                    </div>
                    <span className="text-xs text-gray-600">
                        Ctrl+Enter / ⌘+Enter to run • Tab for autocomplete
                    </span>
                </div>
                <div className="rounded-lg border border-gray-700 overflow-hidden mb-3">
                    <SQLEditor
                        key={activeTab.id}
                        value={activeTab.query}
                        onChange={(newQuery) =>
                            updateTabQuery(activeTabId, newQuery)
                        }
                        onRunQuery={onRunQuery}
                        tableColumns={tableColumns}
                    />
                </div>
                <div>
                    <button
                        onClick={() => onRunQuery(activeTab.query)}
                        disabled={loading || !activeTab.query.trim()}
                        className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <svg
                                    className="animate-spin w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                Running...
                            </>
                        ) : (
                            <>
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
                                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                Run Query
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
