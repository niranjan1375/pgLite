"use client";

import { RefreshIcon } from "@/icons";

interface RunStripProps {
    workspaceMode: boolean;
    hasQuery: boolean;
    loading: boolean;
    executionTime?: number;
    loadingTables: boolean;
    onSaveTemplate: () => void;
    onSaveQuery: () => void;
    onRefreshSchema: () => void;
    onRun: () => void;
    onCancel: () => void;
    onExplain: () => void;
}

/** Action strip under the editor: save, refresh intellisense, run/cancel/explain. */
export default function RunStrip({
    workspaceMode,
    hasQuery,
    loading,
    executionTime,
    loadingTables,
    onSaveTemplate,
    onSaveQuery,
    onRefreshSchema,
    onRun,
    onCancel,
    onExplain,
}: RunStripProps) {
    return (
        <div
            className="h-[34px] flex items-center justify-between gap-3 px-3 border-t flex-shrink-0 overflow-x-auto"
            style={{
                background: "var(--panel)",
                borderColor: "var(--border)",
            }}
        >
            <div className="flex items-center gap-2 shrink-0">
                {workspaceMode && (
                    <button
                        onClick={onSaveTemplate}
                        className="cyber-btn cyber-btn-accent"
                        title="Save or overwrite template"
                    >
                        save template
                    </button>
                )}

                <button
                    onClick={onSaveQuery}
                    disabled={!hasQuery}
                    className="cyber-btn cyber-btn-warn"
                    title="Save current query"
                >
                    save query
                </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={onRefreshSchema}
                    disabled={loadingTables}
                    className="cyber-btn"
                    title="Refresh autocomplete/intellisense data"
                >
                    <span className="flex items-center gap-1">
                        <RefreshIcon
                            className={`w-3 h-3${loadingTables ? " animate-spin" : ""}`}
                        />
                        {loadingTables ? "refreshing" : "intellisense"}
                    </span>
                </button>

                <button
                    onClick={onRun}
                    disabled={loading || !hasQuery}
                    className="cyber-btn cyber-btn-accent"
                    style={{ minWidth: "80px", justifyContent: "center" }}
                >
                    {loading ? (
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 border border-current border-t-transparent animate-spin" />
                            {executionTime !== undefined
                                ? `${(executionTime / 1000).toFixed(1)}s`
                                : "running"}
                        </span>
                    ) : (
                        "run ⌘↵"
                    )}
                </button>
                {loading && (
                    <button
                        onClick={onCancel}
                        className="cyber-btn cyber-btn-warn"
                        title="Cancel running query"
                        style={{ justifyContent: "center" }}
                    >
                        cancel
                    </button>
                )}
                <button
                    onClick={onExplain}
                    disabled={loading || !hasQuery}
                    className="cyber-btn cyber-btn-warn"
                    title="Run EXPLAIN ANALYZE"
                >
                    explain
                </button>
            </div>
        </div>
    );
}
