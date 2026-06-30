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
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div
            className="flex flex-col items-center justify-center h-full select-none"
            style={{ color: "var(--text-muted)", background: "var(--bg)" }}
        >
            {/* Cyber grid decoration */}
            <div className="relative mb-8" style={{ width: 80, height: 80 }}>
                {/* Outer ring */}
                <div
                    className="absolute inset-0"
                    style={{
                        border: "1px solid var(--border)",
                    }}
                />
                {/* Inner ring */}
                <div
                    className="absolute"
                    style={{
                        inset: 12,
                        border: "1px solid var(--border-bright)",
                    }}
                />
                {/* Center glyph */}
                <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                        fontSize: 28,
                        color: "var(--text-dim)",
                    }}
                >
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                        <path d="M14 3v22M3 14h22" strokeOpacity="0.3" />
                        <path d="M7 7l14 14M21 7L7 21" strokeOpacity="0.15" />
                        <circle cx="14" cy="14" r="4" strokeOpacity="0.5" />
                        <circle cx="14" cy="14" r="1.5" fill="currentColor" strokeOpacity="0" opacity="0.6" />
                    </svg>
                </div>
                {/* Corner accents */}
                {[
                    { top: 0, left: 0, borderTop: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderLeft: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", width: 10, height: 10 },
                    { top: 0, right: 0, borderTop: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderRight: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", width: 10, height: 10 },
                    { bottom: 0, left: 0, borderBottom: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderLeft: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", width: 10, height: 10 },
                    { bottom: 0, right: 0, borderBottom: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderRight: "2px solid color-mix(in srgb, var(--accent) 35%, transparent)", width: 10, height: 10 },
                ].map((style, i) => (
                    <div key={i} className="absolute" style={{ ...style, position: "absolute" }} />
                ))}
            </div>

            <div className="text-center" style={{ maxWidth: 320 }}>
                <h3
                    className="text-[13px] uppercase tracking-[0.2em] mb-2"
                    style={{ color: "var(--text-muted)", fontWeight: 500 }}
                >
                    {title}
                </h3>
                {description && (
                    <p
                        className="text-[11px] tracking-wide leading-relaxed"
                        style={{ color: "var(--text-dim)" }}
                    >
                        {description}
                    </p>
                )}
                {action && (
                    <button
                        onClick={action.onClick}
                        className="mt-4 cyber-btn cyber-btn-accent"
                    >
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
}
