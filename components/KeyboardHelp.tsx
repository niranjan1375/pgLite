"use client";

import { useState } from "react";
import { useEscapeKey, useKeyboard } from "@/hooks/useKeyboard";

export default function KeyboardHelp() {
    const [isOpen, setIsOpen] = useState(false);

    useEscapeKey(() => setIsOpen(false), isOpen);
    useKeyboard([
        {
            key: "k",
            ctrl: true,
            description: "Toggle keyboard help",
            handler: () => setIsOpen((prev) => !prev),
        },
        {
            key: "?",
            shift: true,
            description: "Open keyboard help",
            handler: () => setIsOpen(true),
        },
    ]);

    const shortcuts = [
        { keys: ["⌘", "Enter"], description: "Execute query" },
        { keys: ["⌘", "K"], description: "Toggle keyboard help" },
        { keys: ["?"], description: "Open keyboard help" },
        { keys: ["⌘", "H"], description: "Toggle query history" },
        { keys: ["⌘", "J"], description: "Toggle saved queries" },
        { keys: ["⌘", "G"], description: "Toggle context" },
        { keys: ["Esc"], description: "Close menu/dialog" },
        { keys: ["⌘", "T"], description: "New tab" },
        { keys: ["⌘", "W"], description: "Close tab" },
    ];

    return (
        <>
            {/* Help button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-4 right-4 w-8 h-8 flex items-center justify-center text-[14px] border z-50 hover:opacity-80 transition-opacity"
                style={{
                    background: "var(--panel)",
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                }}
                title="Keyboard shortcuts (⌘K)"
            >
                ?
            </button>

            {/* Help modal */}
            {isOpen && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50"
                    style={{ background: "rgba(0, 0, 0, 0.8)" }}
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        className="border max-w-md w-full mx-4"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                            padding: "20px",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="px-4 py-3 border-b flex justify-between items-center"
                            style={{
                                borderColor: "var(--border)",
                                paddingBottom: "10px",
                            }}
                        >
                            <h2
                                className="text-[12px] uppercase tracking-wider"
                                style={{ color: "var(--text-primary)" }}
                            >
                                Keyboard Shortcuts
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="hover:opacity-60"
                                style={{ color: "var(--text-muted)" }}
                            >
                                ×
                            </button>
                        </div>
                        <div
                            className="p-4 gap-3 flex flex-col"
                            style={{ marginTop: "12px" }}
                        >
                            {shortcuts.map((shortcut, idx) => (
                                <div
                                    key={idx}
                                    className="flex justify-between items-center py-2"
                                >
                                    <span
                                        className="text-[12px]"
                                        style={{
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        {shortcut.description}
                                    </span>
                                    <div className="flex gap-1">
                                        {shortcut.keys.map((key, keyIdx) => (
                                            <kbd
                                                key={keyIdx}
                                                className="px-2 py-1 text-[11px] border"
                                                style={{
                                                    background: "var(--bg)",
                                                    borderColor:
                                                        "var(--border)",
                                                    color: "var(--accent)",
                                                    padding: "2px 6px",
                                                }}
                                            >
                                                {key}
                                            </kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
