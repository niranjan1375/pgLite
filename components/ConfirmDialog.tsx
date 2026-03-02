/**
 * Confirmation Dialog Component
 * Brutal hacker minimal design
 */

"use client";

import { useEscapeKey } from "@/hooks/useKeyboard";

interface ConfirmDialogProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDangerous?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    isDangerous = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    useEscapeKey(onCancel, true);

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: "rgba(0, 0, 0, 0.85)" }}
            onClick={onCancel}
        >
            <div
                className="border max-w-md w-full mx-4"
                style={{
                    background: "var(--panel)",
                    borderColor: isDangerous ? "var(--error)" : "var(--border)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-4 py-3 border-b"
                    style={{
                        borderColor: isDangerous
                            ? "var(--error)"
                            : "var(--border)",
                        background: isDangerous ? "#1a0505" : "var(--bg)",
                    }}
                >
                    <h2
                        className="text-[12px] uppercase tracking-wider flex items-center gap-2"
                        style={{
                            color: isDangerous
                                ? "var(--error)"
                                : "var(--text-primary)",
                        }}
                    >
                        {isDangerous && "⚠"}
                        {title}
                    </h2>
                </div>

                {/* Content */}
                <div className="p-4">
                    <p
                        className="text-[12px] leading-relaxed"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div
                    className="px-4 py-3 border-t flex gap-2 justify-end"
                    style={{ borderColor: "var(--border)" }}
                >
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-[11px] uppercase tracking-wide border hover:opacity-80 transition-opacity"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-muted)",
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-3 py-1.5 text-[11px] uppercase tracking-wide border hover:opacity-80 transition-opacity"
                        style={{
                            borderColor: isDangerous
                                ? "var(--error)"
                                : "var(--accent)",
                            color: isDangerous
                                ? "var(--error)"
                                : "var(--accent)",
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
