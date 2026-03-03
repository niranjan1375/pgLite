"use client";

interface ActivityBarProps {
    sidebarCollapsed: boolean;
    onToggleSidebar: () => void;
}

export default function ActivityBar({
    sidebarCollapsed,
    onToggleSidebar,
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
        </div>
    );
}
