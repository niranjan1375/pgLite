"use client";

import { useState } from "react";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { type SavedQueryInput } from "@/lib/queryStorage";

interface SaveQueryModalProps {
    isOpen: boolean;
    initialName: string;
    query: string;
    environment: string;
    database: string;
    mode: "standard" | "workspace";
    onSave: (input: SavedQueryInput) => void;
    onCancel: () => void;
}

export default function SaveQueryModal({
    isOpen,
    initialName,
    query,
    environment,
    database,
    mode,
    onSave,
    onCancel,
}: SaveQueryModalProps) {
    const [name, setName] = useState("");
    const [folder, setFolder] = useState("");
    const [tags, setTags] = useState("");
    const [starred, setStarred] = useState(false);

    useEscapeKey(onCancel, isOpen);

    if (!isOpen) {
        return null;
    }

    const trimmedQuery = query.trim();

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: "rgba(0, 0, 0, 0.85)" }}
            onClick={onCancel}
        >
            <div
                className="border max-w-lg w-full mx-4"
                style={{
                    background: "var(--panel)",
                    borderColor: "var(--accent)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="px-4 py-3 border-b"
                    style={{
                        borderColor: "var(--border)",
                        background: "var(--bg)",
                    }}
                >
                    <h2
                        className="text-[12px] uppercase tracking-wider"
                        style={{ color: "var(--accent)" }}
                    >
                        Save Query
                    </h2>
                </div>

                <div className="p-4 space-y-3">
                    <div className="space-y-1">
                        <label
                            className="block text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Name
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Recent failed transactions"
                            className="w-full px-3 py-2 text-[12px] border outline-none"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="block text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Folder
                        </label>
                        <input
                            value={folder}
                            onChange={(e) => setFolder(e.target.value)}
                            placeholder="Investigations"
                            className="w-full px-3 py-2 text-[12px] border outline-none"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="block text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Tags
                        </label>
                        <input
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="perf, users, prod"
                            className="w-full px-3 py-2 text-[12px] border outline-none"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        />
                    </div>

                    <div
                        className="border px-3 py-2 text-[11px] uppercase tracking-wide"
                        style={{
                            borderColor: "var(--border)",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {environment} • {database || "workspace"} • {mode}
                    </div>

                    <label
                        className="flex items-center gap-2 text-[12px]"
                        style={{ color: "var(--text-primary)" }}
                    >
                        <input
                            type="checkbox"
                            checked={starred}
                            onChange={(e) => setStarred(e.target.checked)}
                        />
                        Star this query
                    </label>

                    <div className="space-y-1">
                        <div
                            className="text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Preview
                        </div>
                        <pre
                            className="max-h-[180px] overflow-auto border p-3 text-[11px] whitespace-pre-wrap break-words"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-secondary)",
                            }}
                        >
                            {trimmedQuery || "(empty query)"}
                        </pre>
                    </div>
                </div>

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
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (!name.trim() || !trimmedQuery) {
                                return;
                            }

                            onSave({
                                name,
                                query,
                                folder,
                                tags: tags
                                    .split(",")
                                    .map((tag) => tag.trim())
                                    .filter(Boolean),
                                starred,
                                environment,
                                database,
                                mode,
                            });
                        }}
                        disabled={!name.trim() || !trimmedQuery}
                        className="px-3 py-1.5 text-[11px] uppercase tracking-wide border hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{
                            borderColor: "var(--accent)",
                            color: "var(--accent)",
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
