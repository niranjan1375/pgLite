"use client";

interface EmptyStateProps {
    icon?: string;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export default function EmptyState({
    icon = "▦",
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div
            className="flex flex-col items-center justify-center h-full"
            style={{
                color: "var(--text-muted)",
            }}
        >
            <div className="text-center max-w-md">
                <div
                    className="text-[48px] mb-4"
                    style={{ color: "var(--border)" }}
                >
                    {icon}
                </div>
                <h3
                    className="text-[14px] uppercase tracking-wider mb-2"
                    style={{ color: "var(--text-secondary)" }}
                >
                    {title}
                </h3>
                {description && (
                    <p
                        className="text-[12px] mb-4"
                        style={{ color: "var(--text-muted)" }}
                    >
                        {description}
                    </p>
                )}
                {action && (
                    <button
                        onClick={action.onClick}
                        className="px-4 py-2 text-[12px] uppercase tracking-wide border hover:opacity-80 transition-opacity"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--accent)",
                        }}
                    >
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
}
