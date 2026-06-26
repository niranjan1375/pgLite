"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboard } from "@/hooks/useKeyboard";
import { type ContextProfile } from "@/lib/variable-resolver";

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

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROFILE_ID_REGEX = /^[A-Za-z0-9._-]+$/;

/** A row in the editing grid: one variable across all environments. */
interface VarRow {
    rowId: string;
    name: string;
    values: Record<string, string>;
}

function newRowId(): string {
    return `r-${Math.random().toString(36).slice(2, 9)}`;
}

function slugify(name: string): string {
    const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || `profile-${Math.random().toString(36).slice(2, 7)}`;
}

/** Build editable rows (env-first storage -> variable-first grid). */
function buildRows(profile: ContextProfile | undefined): VarRow[] {
    if (!profile) return [];
    const keys = new Set<string>();
    for (const values of Object.values(profile.environments ?? {})) {
        for (const key of Object.keys(values)) keys.add(key);
    }
    return [...keys].sort().map((name) => {
        const values: Record<string, string> = {};
        for (const [env, vals] of Object.entries(profile.environments ?? {})) {
            if (vals[name] !== undefined) values[env] = vals[name];
        }
        return { rowId: newRowId(), name, values };
    });
}

/** Serialize grid rows back to env-first storage, pruning empties. */
function serializeRows(rows: VarRow[]): Record<string, Record<string, string>> {
    const environments: Record<string, Record<string, string>> = {};
    for (const row of rows) {
        const name = row.name.trim();
        if (!name) continue;
        for (const [env, value] of Object.entries(row.values)) {
            if (value.trim().length === 0) continue;
            (environments[env] ??= {})[name] = value;
        }
    }
    return environments;
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
    const [draft, setDraft] = useState<ContextProfile[]>(profiles);
    const [selectedId, setSelectedId] = useState<string | null>(
        activeProfileId,
    );
    const [rows, setRows] = useState<VarRow[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    useKeyboard([
        { key: "g", ctrl: true, description: "Toggle context", handler: onToggle },
    ]);

    const selectedProfile = useMemo(
        () =>
            draft.find((p) => p.id === selectedId) ?? draft[0] ?? undefined,
        [draft, selectedId],
    );

    // Resync from props when there are no pending edits (e.g. after a save or
    // an external refresh). Avoids clobbering in-progress edits.
    useEffect(() => {
        if (dirty) return;
        setDraft(profiles);
        const nextId =
            (activeProfileId &&
                profiles.some((p) => p.id === activeProfileId) &&
                activeProfileId) ||
            profiles[0]?.id ||
            null;
        setSelectedId(nextId);
        setRows(buildRows(profiles.find((p) => p.id === nextId)));
    }, [profiles, activeProfileId, dirty]);

    // Columns: known environments first, then any stale envs present in data.
    const envColumns = useMemo(() => {
        const known = new Set(environmentIds);
        const extras = new Set<string>();
        for (const profile of draft) {
            for (const env of Object.keys(profile.environments ?? {})) {
                if (!known.has(env)) extras.add(env);
            }
        }
        return [
            ...environmentIds.map((id) => ({ id, known: true })),
            ...[...extras].map((id) => ({ id, known: false })),
        ];
    }, [environmentIds, draft]);

    const commitRowsToDraft = useCallback(
        (nextRows: VarRow[]) => {
            setRows(nextRows);
            setDirty(true);
            setFeedback(null);
            setDraft((prev) =>
                prev.map((p) =>
                    p.id === selectedProfile?.id
                        ? { ...p, environments: serializeRows(nextRows) }
                        : p,
                ),
            );
        },
        [selectedProfile?.id],
    );

    const handleSelectProfile = (id: string) => {
        setSelectedId(id);
        setRows(buildRows(draft.find((p) => p.id === id)));
        onSetActiveProfile(id);
    };

    const handleAddProfile = () => {
        const name = `Profile ${draft.length + 1}`;
        let id = slugify(name);
        while (draft.find((p) => p.id === id)) id = `${id}-${draft.length}`;
        const profile: ContextProfile = { id, name, environments: {} };
        setDraft((prev) => [...prev, profile]);
        setSelectedId(id);
        setRows([]);
        setDirty(true);
        onSetActiveProfile(id);
    };

    const handleRenameProfile = (name: string) => {
        if (!selectedProfile) return;
        setDirty(true);
        setDraft((prev) =>
            prev.map((p) =>
                p.id === selectedProfile.id ? { ...p, name } : p,
            ),
        );
    };

    const handleDeleteProfile = () => {
        if (!selectedProfile) return;
        const remaining = draft.filter((p) => p.id !== selectedProfile.id);
        setDraft(remaining);
        const nextId = remaining[0]?.id ?? null;
        setSelectedId(nextId);
        setRows(buildRows(remaining.find((p) => p.id === nextId)));
        setDirty(true);
        if (nextId) onSetActiveProfile(nextId);
    };

    const handleSave = async () => {
        // Light client-side validation; server validates authoritatively.
        for (const profile of draft) {
            if (!PROFILE_ID_REGEX.test(profile.id) || !profile.name.trim()) {
                setFeedback(`Profile "${profile.name || profile.id}" needs a valid id and name.`);
                return;
            }
        }
        for (const row of rows) {
            const name = row.name.trim();
            if (name && !VARIABLE_NAME_REGEX.test(name)) {
                setFeedback(`Invalid variable name "${name}".`);
                return;
            }
        }
        setSaving(true);
        setFeedback(null);
        try {
            await onSave(draft);
            setDirty(false);
            setFeedback("Saved.");
        } catch (error) {
            setFeedback(
                error instanceof Error ? error.message : "Failed to save.",
            );
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <aside
            className="w-[460px] flex-shrink-0 border-l flex flex-col min-h-0"
            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
            <div
                className="px-3 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
            >
                <div className="flex items-center justify-between gap-3">
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

                {/* Profile selector + management */}
                <div className="mt-3 flex items-center gap-2">
                    <select
                        value={selectedProfile?.id ?? ""}
                        onChange={(e) => handleSelectProfile(e.target.value)}
                        className="flex-1 text-[11px] px-2 py-1.5 rounded border outline-none"
                        style={{
                            background: "var(--bg)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                        }}
                    >
                        {draft.length === 0 && <option value="">No profiles</option>}
                        {draft.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleAddProfile}
                        className="text-[11px] px-2 py-1.5 rounded border hover:opacity-80 transition-opacity"
                        style={{
                            background: "var(--bg)",
                            borderColor: "var(--border)",
                            color: "var(--text-secondary)",
                        }}
                        title="Add profile"
                    >
                        + Profile
                    </button>
                </div>

                {selectedProfile && (
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            value={selectedProfile.name}
                            onChange={(e) => handleRenameProfile(e.target.value)}
                            placeholder="Profile name"
                            className="flex-1 text-[11px] px-2 py-1.5 rounded border outline-none"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--text-primary)",
                            }}
                        />
                        <button
                            onClick={handleDeleteProfile}
                            className="text-[11px] px-2 py-1.5 rounded border hover:opacity-80 transition-opacity"
                            style={{
                                background: "var(--bg)",
                                borderColor: "var(--border)",
                                color: "var(--error)",
                            }}
                            title="Delete profile"
                        >
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {/* Editing grid: variables (rows) x environments (columns) */}
            <div className="flex-1 min-h-0 overflow-auto">
                {!selectedProfile ? (
                    <div
                        className="text-[11px] px-3 py-4"
                        style={{ color: "var(--text-muted)" }}
                    >
                        No profile selected. Add one to define shared variables.
                    </div>
                ) : (
                    <table className="text-[11px] border-collapse w-full">
                        <thead>
                            <tr>
                                <th
                                    className="sticky left-0 top-0 z-10 text-left px-2 py-1.5 border-b border-r font-normal"
                                    style={{
                                        background: "var(--panel)",
                                        borderColor: "var(--border)",
                                        color: "var(--text-muted)",
                                        minWidth: "120px",
                                    }}
                                >
                                    Variable
                                </th>
                                {envColumns.map((env) => (
                                    <th
                                        key={env.id}
                                        className="text-left px-2 py-1.5 border-b font-normal whitespace-nowrap"
                                        style={{
                                            color: env.known
                                                ? "var(--text-secondary)"
                                                : "var(--text-muted)",
                                            borderColor: "var(--border)",
                                            minWidth: "130px",
                                        }}
                                        title={
                                            env.known
                                                ? environmentNamesById[env.id] ||
                                                  env.id
                                                : `${env.id} (unknown environment)`
                                        }
                                    >
                                        {environmentNamesById[env.id] || env.id}
                                        {!env.known && " ⚠"}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.rowId}>
                                    <td
                                        className="sticky left-0 z-10 px-1 py-0.5 border-b border-r"
                                        style={{
                                            background: "var(--panel)",
                                            borderColor: "var(--border)",
                                        }}
                                    >
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() =>
                                                    commitRowsToDraft(
                                                        rows.filter(
                                                            (r) =>
                                                                r.rowId !==
                                                                row.rowId,
                                                        ),
                                                    )
                                                }
                                                className="text-[11px] px-1 hover:opacity-70"
                                                style={{
                                                    color: "var(--text-muted)",
                                                }}
                                                title="Remove variable"
                                            >
                                                x
                                            </button>
                                            <input
                                                value={row.name}
                                                onChange={(e) =>
                                                    commitRowsToDraft(
                                                        rows.map((r) =>
                                                            r.rowId === row.rowId
                                                                ? {
                                                                      ...r,
                                                                      name: e
                                                                          .target
                                                                          .value,
                                                                  }
                                                                : r,
                                                        ),
                                                    )
                                                }
                                                placeholder="@name"
                                                className="w-full text-[11px] px-1 py-1 rounded outline-none"
                                                style={{
                                                    background: "var(--bg)",
                                                    color: "var(--accent)",
                                                }}
                                            />
                                        </div>
                                    </td>
                                    {envColumns.map((env) => (
                                        <td
                                            key={env.id}
                                            className="px-1 py-0.5 border-b"
                                            style={{
                                                borderColor: "var(--border)",
                                            }}
                                        >
                                            <input
                                                value={row.values[env.id] ?? ""}
                                                onChange={(e) =>
                                                    commitRowsToDraft(
                                                        rows.map((r) =>
                                                            r.rowId === row.rowId
                                                                ? {
                                                                      ...r,
                                                                      values: {
                                                                          ...r.values,
                                                                          [env.id]:
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                      },
                                                                  }
                                                                : r,
                                                        ),
                                                    )
                                                }
                                                placeholder="—"
                                                className="w-full text-[11px] px-1 py-1 rounded outline-none"
                                                style={{
                                                    background: "var(--bg)",
                                                    color: "var(--text-primary)",
                                                }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {selectedProfile && (
                    <button
                        onClick={() =>
                            commitRowsToDraft([
                                ...rows,
                                { rowId: newRowId(), name: "", values: {} },
                            ])
                        }
                        className="text-[11px] px-3 py-2 hover:opacity-80"
                        style={{ color: "var(--accent)" }}
                    >
                        + Add variable
                    </button>
                )}
            </div>

            {/* Footer: save / status */}
            <div
                className="px-3 py-2 border-t flex items-center justify-between gap-2"
                style={{ borderColor: "var(--border)" }}
            >
                <span
                    className="text-[10px] truncate"
                    style={{
                        color: feedback?.startsWith("Saved")
                            ? "var(--accent)"
                            : feedback
                              ? "var(--error)"
                              : "var(--text-muted)",
                    }}
                >
                    {feedback || (dirty ? "Unsaved changes" : "Up to date")}
                </span>
                <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="text-[11px] px-3 py-1.5 rounded border transition-opacity"
                    style={{
                        background: dirty ? "var(--accent-dim)" : "var(--bg)",
                        borderColor: dirty ? "var(--accent)" : "var(--border)",
                        color: dirty ? "var(--accent)" : "var(--text-muted)",
                        opacity: !dirty || saving ? 0.6 : 1,
                    }}
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </aside>
    );
}
