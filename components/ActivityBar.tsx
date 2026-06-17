"use client";

interface ActivityBarProps {
    sidebarCollapsed: boolean;
    historyOpen: boolean;
    savedQueriesOpen: boolean;
    onToggleSidebar: () => void;
    onToggleHistory: () => void;
    onToggleSavedQueries: () => void;
}

function IconDatabase() {
    return (
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <ellipse cx="8.5" cy="4.5" rx="5.5" ry="2" />
            <path d="M3 4.5v4c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-4" />
            <path d="M3 8.5v4c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-4" />
        </svg>
    );
}

function IconClock() {
    return (
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="6.5" />
            <polyline points="8.5,5 8.5,8.5 11,10.5" />
        </svg>
    );
}

function IconBookmark() {
    return (
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2.5h9v12.5L8.5 12l-4.5 3V2.5z" />
        </svg>
    );
}

interface ActivityButtonProps {
    active: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}

function ActivityButton({ active, onClick, title, children }: ActivityButtonProps) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="w-full flex items-center justify-center relative transition-all"
            style={{
                height: "44px",
                color: active ? "var(--accent)" : "var(--text-muted)",
                background: active ? "var(--accent-dim)" : "transparent",
            }}
        >
            {children}
            {active && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{
                        background: "var(--accent)",
                        boxShadow: "var(--accent-glow)",
                    }}
                />
            )}
        </button>
    );
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
            className="flex flex-col items-center flex-shrink-0 border-r"
            style={{
                width: "44px",
                background: "var(--bg)",
                borderColor: "var(--border)",
            }}
        >
            <ActivityButton
                active={!sidebarCollapsed}
                onClick={onToggleSidebar}
                title={sidebarCollapsed ? "Show explorer (⌘B)" : "Hide explorer (⌘B)"}
            >
                <IconDatabase />
            </ActivityButton>

            <div className="w-6 h-px" style={{ background: "var(--border)" }} />

            <ActivityButton
                active={historyOpen}
                onClick={onToggleHistory}
                title={historyOpen ? "Hide history (⌘H)" : "Show history (⌘H)"}
            >
                <IconClock />
            </ActivityButton>

            <ActivityButton
                active={savedQueriesOpen}
                onClick={onToggleSavedQueries}
                title={savedQueriesOpen ? "Hide saved queries (⌘J)" : "Show saved queries (⌘J)"}
            >
                <IconBookmark />
            </ActivityButton>
        </div>
    );
}
