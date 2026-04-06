"use client";

interface ActivityBarProps {
    sidebarCollapsed: boolean;
    historyOpen: boolean;
    savedQueriesOpen: boolean;
    onToggleSidebar: () => void;
    onToggleHistory: () => void;
    onToggleSavedQueries: () => void;
}

export default function ActivityBar({
    sidebarCollapsed,
    historyOpen,
    savedQueriesOpen,
    onToggleSidebar,
    onToggleHistory,
    onToggleSavedQueries,
}: ActivityBarProps) {
    return (
        <div
            className="w-[40px] h-full flex flex-col items-center border-r"
            style={{
                background: "var(--bg)",
                borderColor: "var(--border)",
            }}
        >
            <button
                onClick={onToggleSidebar}
                className="w-full h-[40px] flex items-center justify-center text-[18px] transition-colors relative"
                style={{
                    color: "var(--accent)",
                    background: "var(--panel)",
                }}
                title={
                    sidebarCollapsed
                        ? "Show explorer (Cmd/Ctrl+B)"
                        : "Hide explorer (Cmd/Ctrl+B)"
                }
                aria-label={
                    sidebarCollapsed ? "Show explorer" : "Hide explorer"
                }
            >
                {sidebarCollapsed ? "▸" : "◂"}
                <div
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{ background: "var(--accent)" }}
                />
            </button>

            <button
                onClick={onToggleHistory}
                className="w-full h-[40px] flex items-center justify-center text-[12px] transition-colors relative"
                style={{
                    color: historyOpen ? "var(--accent)" : "var(--text-muted)",
                    background: historyOpen ? "var(--panel)" : "transparent",
                }}
                title={
                    historyOpen
                        ? "Hide query history (Cmd/Ctrl+H)"
                        : "Show query history (Cmd/Ctrl+H)"
                }
                aria-label={
                    historyOpen ? "Hide query history" : "Show query history"
                }
            >
                H
                {historyOpen && (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                        style={{ background: "var(--accent)" }}
                    />
                )}
            </button>

            <button
                onClick={onToggleSavedQueries}
                className="w-full h-[40px] flex items-center justify-center text-[12px] transition-colors relative"
                style={{
                    color: savedQueriesOpen
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    background: savedQueriesOpen
                        ? "var(--panel)"
                        : "transparent",
                }}
                title={
                    savedQueriesOpen
                        ? "Hide saved queries (Cmd/Ctrl+J)"
                        : "Show saved queries (Cmd/Ctrl+J)"
                }
                aria-label={
                    savedQueriesOpen
                        ? "Hide saved queries"
                        : "Show saved queries"
                }
            >
                S
                {savedQueriesOpen && (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                        style={{ background: "var(--accent)" }}
                    />
                )}
            </button>
        </div>
    );
}
