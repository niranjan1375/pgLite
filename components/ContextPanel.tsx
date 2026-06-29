"use client";

import { useKeyboard } from "@/hooks/useKeyboard";
import { type ContextProfile } from "@/lib/variable-resolver";
import ContextEditor from "@/components/ContextEditor";

interface ContextPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    profiles: ContextProfile[];
    activeProfileId: string | null;
    environmentIds: string[];
    environmentNamesById: Record<string, string>;
    onSetActiveProfile: (id: string) => void;
    onSave: (profiles: ContextProfile[]) => Promise<void> | void;
}

export default function ContextPanel({
    isOpen,
    onToggle,
    profiles,
    activeProfileId,
    environmentIds,
    environmentNamesById,
    onSetActiveProfile,
    onSave,
}: ContextPanelProps) {
    useKeyboard([
        {
            key: "g",
            ctrl: true,
            description: "Toggle context",
            handler: onToggle,
        },
    ]);

    if (!isOpen) return null;

    return (
        <aside
            className="w-[460px] flex-shrink-0 border-l flex flex-col min-h-0"
            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
            <div
                className="px-3 py-3 border-b flex items-center justify-between gap-3"
                style={{ borderColor: "var(--border)" }}
            >
                <div>
                    <h2
                        className="text-[11px] uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                    >
                        Context
                    </h2>
                    <p
                        className="text-[11px] mt-1"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        Shared variables, resolved per environment
                    </p>
                </div>
                <button
                    onClick={onToggle}
                    className="text-[12px] hover:opacity-70 transition-opacity"
                    style={{ color: "var(--text-muted)" }}
                    title="Hide context (Cmd/Ctrl+G)"
                >
                    x
                </button>
            </div>

            <ContextEditor
                profiles={profiles}
                activeProfileId={activeProfileId}
                environmentIds={environmentIds}
                environmentNamesById={environmentNamesById}
                onSetActiveProfile={onSetActiveProfile}
                onSave={onSave}
            />
        </aside>
    );
}
