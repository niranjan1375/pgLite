"use client";

import { useEscapeKey, useKeyboard } from "@/hooks/useKeyboard";
import { type ContextProfile } from "@/lib/variable-resolver";
import ContextEditor from "@/components/ContextEditor";

interface ContextModalProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    profiles: ContextProfile[];
    activeProfileId: string | null;
    environmentIds: string[];
    environmentNamesById: Record<string, string>;
    onSetActiveProfile: (id: string) => void;
    onSave: (profiles: ContextProfile[]) => Promise<void> | void;
    /** The env of the active query tab — highlighted in the grid. */
    currentEnvironment?: string;
}

export default function ContextModal({
    isOpen,
    onToggle,
    onClose,
    profiles,
    activeProfileId,
    environmentIds,
    environmentNamesById,
    onSetActiveProfile,
    onSave,
    currentEnvironment,
}: ContextModalProps) {
    // Open/close with Cmd/Ctrl+Shift+G (distinct from the panel's Cmd/Ctrl+G).
    useKeyboard([
        {
            key: "g",
            ctrl: true,
            shift: true,
            description: "Toggle context (quick)",
            handler: onToggle,
        },
    ]);
    useEscapeKey(onClose, isOpen);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.8)" }}
            onClick={onClose}
        >
            <div
                className="border flex flex-col"
                style={{
                    background: "var(--panel)",
                    borderColor: "var(--accent)",
                    width: "min(1100px, 92vw)",
                    height: "min(720px, 86vh)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="px-4 py-3 border-b flex items-center justify-between gap-3"
                    style={{
                        borderColor: "var(--border)",
                        background: "var(--bg)",
                    }}
                >
                    <div className="flex items-baseline gap-3">
                        <h2
                            className="text-[12px] uppercase tracking-wider"
                            style={{ color: "var(--accent)" }}
                        >
                            Context
                        </h2>
                        <span
                            className="text-[11px]"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            Shared variables, resolved per environment
                            {currentEnvironment
                                ? ` · querying ${currentEnvironment}`
                                : ""}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[12px] hover:opacity-70 transition-opacity"
                        style={{ color: "var(--text-muted)" }}
                        title="Close (Esc)"
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
                    highlightEnvironment={currentEnvironment}
                />
            </div>
        </div>
    );
}
