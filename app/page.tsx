"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import DatabaseTree from "@/components/DatabaseTree";
import ExplainView from "@/components/ExplainView";
import ResultsTable from "@/components/ResultsTable";
import ResultBanners from "@/components/ResultBanners";
import RunStrip from "@/components/RunStrip";
import ActivityBar from "@/components/ActivityBar";
import StatusBar from "@/components/StatusBar";
import EnvironmentStrip from "@/components/EnvironmentStrip";
import KeyboardHelp from "@/components/KeyboardHelp";
import ConfirmDialog from "@/components/ConfirmDialog";
import QueryHistory from "@/components/QueryHistory";
import SaveQueryModal from "@/components/SaveQueryModal";
import SavedQueries from "@/components/SavedQueries";
import ContextPanel from "@/components/ContextPanel";
import ContextModal from "@/components/ContextModal";
import { type QueryTab, type QueryTabsRef } from "@/components/QueryTabs";
import { type SavedQuery, type SavedQueryInput } from "@/lib/queryStorage";
import {
    extractVariables,
    selectionOverlapsVariableBlock,
} from "@/lib/workspace-utils";
import { displayTableName } from "@/lib/sql-literal";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useContextProfiles } from "@/hooks/useContextProfiles";
import { useQueryHistory, useSavedQueries } from "@/hooks/useQueryLibrary";
import { useEditorLayout } from "@/hooks/useEditorLayout";
import { useSchemaMetadata } from "@/hooks/useSchemaMetadata";
import { useTemplates } from "@/hooks/useTemplates";
import { useQueryExecution } from "@/hooks/useQueryExecution";
import { useConnection } from "@/hooks/useConnection";

const SQLEditor = dynamic(() => import("@/components/SQLEditor"), {
    ssr: false,
});

const QueryTabs = dynamic(() => import("@/components/QueryTabs"), {
    ssr: false,
});

type SidePanel = "history" | "saved" | "context";

interface RunOptions {
    /** SQL to run instead of the whole tab (selection / statement at cursor). */
    sql?: string;
    selection?: { isSelection: boolean; selectionStartLineNumber?: number };
    explain?: boolean;
}

export default function Home() {
    const queryTabsRef = useRef<QueryTabsRef>(null);
    const [activeTab, setActiveTab] = useState<QueryTab | null>(null);
    const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
    const [contextModalOpen, setContextModalOpen] = useState(false);
    const [saveQueryModalOpen, setSaveQueryModalOpen] = useState(false);
    const [saveQueryModalSeed, setSaveQueryModalSeed] = useState(0);

    const {
        environmentIds,
        environmentNamesById,
        defaultEnvironment,
        isProdEnvironment,
    } = useEnvironments();
    const contexts = useContextProfiles();
    const history = useQueryHistory();
    const saved = useSavedQueries();
    const layout = useEditorLayout();
    const schema = useSchemaMetadata(activeTab);
    const connection = useConnection(activeTab?.environment);
    const exec = useQueryExecution({
        activeTab,
        isProdEnvironment,
        getPrimaryKeys: schema.getPrimaryKeys,
        onHistory: history.append,
        onQueryFinished: connection.reportQuery,
    });
    const { setError, runQuery, resetResults } = exec;
    const { buildWorkspaceVariables } = contexts;
    const { save: saveQuery } = saved;
    const { fetchDatabases } = schema;
    const templates = useTemplates({
        workspaceActive: activeTab?.mode === "workspace",
        queryTabsRef,
        defaultEnvironment,
        onError: setError,
    });

    const togglePanel = useCallback((panel: SidePanel) => {
        setSidePanel((current) => (current === panel ? null : panel));
    }, []);

    // Context variable names resolvable for the active tab's environment —
    // surfaced in the editor's autocomplete (workspace mode only).
    const editorContextVariables = useMemo(() => {
        if (activeTab?.mode !== "workspace" || !activeTab.environment) return [];
        return Object.keys(
            contexts.activeProfile?.environments?.[activeTab.environment] ?? {},
        );
    }, [contexts.activeProfile, activeTab?.environment, activeTab?.mode]);

    const handleSaveQuery = useCallback(
        (input: SavedQueryInput) => {
            saveQuery(input);
            setSidePanel("saved");
            setSaveQueryModalOpen(false);
        },
        [saveQuery],
    );

    const handleSelectSavedQuery = useCallback((savedQuery: SavedQuery) => {
        const tabs = queryTabsRef.current;
        const currentTab = tabs?.getActiveTab();
        if (!tabs || !currentTab) return;

        tabs.updateQuery(savedQuery.query);
        if (
            savedQuery.environment &&
            currentTab.environment !== savedQuery.environment
        ) {
            tabs.updateTabEnvironment(currentTab.id, savedQuery.environment);
        }
        if (
            savedQuery.database &&
            currentTab.database !== savedQuery.database &&
            savedQuery.mode !== "workspace"
        ) {
            tabs.updateTabDatabase(currentTab.id, savedQuery.database);
        }
        setSidePanel(null);
    }, []);

    // Run the active tab (Run/Explain buttons) or the editor's selection /
    // statement at cursor (⌘↵). Workspace mode merges Context + local @vars
    // and sends only the ones the SQL references.
    const runActiveTab = useCallback(
        ({ sql, selection, explain = false }: RunOptions = {}) => {
            const tab = queryTabsRef.current?.getActiveTab();
            if (!tab) return;

            const target = {
                environment: tab.environment,
                database: tab.database,
                readOnly: tab.readOnly,
                explain,
            };

            if (tab.mode !== "workspace") {
                void runQuery({
                    ...target,
                    query: sql ?? tab.query,
                    mode: "standard",
                });
                return;
            }

            try {
                const {
                    variables: localVariables,
                    sqlWithoutVars,
                    variableBlockEndLine,
                } = extractVariables(tab.query);

                if (
                    selection?.isSelection &&
                    typeof selection.selectionStartLineNumber === "number" &&
                    selectionOverlapsVariableBlock(
                        selection.selectionStartLineNumber - 1,
                        variableBlockEndLine,
                    )
                ) {
                    throw new Error(
                        "Selection overlaps variable block. Select SQL below variable definitions.",
                    );
                }

                const query = (sql ?? sqlWithoutVars).trim();
                if (!query) {
                    throw new Error("No SQL to execute.");
                }

                void runQuery({
                    ...target,
                    query,
                    mode: "workspace",
                    variables: buildWorkspaceVariables(
                        query,
                        localVariables,
                        tab.environment,
                    ),
                });
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Variable validation failed",
                );
            }
        },
        [runQuery, buildWorkspaceVariables, setError],
    );

    const lastTabTargetRef = useRef<string | null>(null);

    const handleTabChange = useCallback(
        async (tab: QueryTab) => {
            setActiveTab((prevTab) => {
                // Only update if something meaningful changed
                if (
                    prevTab?.id === tab.id &&
                    prevTab?.environment === tab.environment &&
                    prevTab?.database === tab.database &&
                    prevTab?.readOnly === tab.readOnly
                ) {
                    return prevTab; // Return same reference to prevent re-render
                }
                return tab;
            });

            // Toggling read-only keeps the current results (e.g. turning it off
            // to delete a row in the table viewer); only a different tab,
            // environment or database starts fresh.
            const target = `${tab.id}|${tab.environment}|${tab.database}`;
            if (lastTabTargetRef.current === target) {
                return;
            }
            lastTabTargetRef.current = target;

            resetResults();
            await fetchDatabases(tab.environment);
        },
        [resetResults, fetchDatabases],
    );

    const databases = activeTab
        ? schema.databasesByEnv[activeTab.environment] || []
        : [];
    const routedDatabase =
        exec.result?.routedDatabase || exec.explainResult?.routedDatabase;
    const pendingWrite = exec.pendingWrite;

    return (
        <div
            className="flex h-screen"
            style={{
                background: "var(--bg)",
                color: "var(--text-primary)",
            }}
        >
            {/* Activity Bar - 40px left strip */}
            <ActivityBar
                sidebarCollapsed={layout.sidebarCollapsed}
                historyOpen={sidePanel === "history"}
                savedQueriesOpen={sidePanel === "saved"}
                contextOpen={sidePanel === "context"}
                onToggleSidebar={layout.toggleSidebar}
                onToggleHistory={() => togglePanel("history")}
                onToggleSavedQueries={() => togglePanel("saved")}
                onToggleContext={() => togglePanel("context")}
            />

            {/* Main Layout */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Query Tabs */}
                <div
                    className="border-b flex-shrink-0 flex items-stretch"
                    style={{ borderColor: "var(--border)" }}
                >
                    <div className="flex-1 min-w-0">
                        <QueryTabs
                            ref={queryTabsRef}
                            globalDatabase={activeTab?.database || ""}
                            globalEnvironment={
                                activeTab?.environment || defaultEnvironment
                            }
                            environmentNames={environmentNamesById}
                            isProduction={isProdEnvironment}
                            databases={databases}
                            onTabChange={handleTabChange}
                        />
                    </div>
                </div>

                {/* Content: Explorer | Editor + Results */}
                <div className="flex flex-1 min-h-0">
                    {!layout.sidebarCollapsed && (
                        <aside
                            className="w-[240px] flex-shrink-0 border-r flex flex-col"
                            style={{
                                background: "var(--panel)",
                                borderColor: "var(--border)",
                            }}
                        >
                            <DatabaseTree
                                selectedDatabase={activeTab?.database || ""}
                                tableColumns={schema.tableColumns}
                                primaryKeysByTable={schema.primaryKeysByTable}
                                onTablePreview={exec.previewTable}
                                templates={templates.templates}
                                templatesLoading={templates.loadingTemplates}
                                onTemplateOpen={templates.openTemplate}
                                onRefresh={() => schema.refreshSchema(true)}
                                loading={schema.loadingTables}
                                workspaceMode={activeTab?.mode === "workspace"}
                                workspaceSchemas={schema.workspaceSchemas}
                            />
                        </aside>
                    )}

                    {/* Editor + Results */}
                    <main className="flex-1 flex flex-col min-w-0">
                        {activeTab && (
                            <EnvironmentStrip
                                environment={activeTab.environment}
                                database={activeTab.database}
                                readOnly={activeTab.readOnly}
                                production={isProdEnvironment(activeTab.environment)}
                                workspaceMode={activeTab.mode === "workspace"}
                                availableEnvironments={
                                    environmentIds.length > 0
                                        ? environmentIds
                                        : [defaultEnvironment]
                                }
                                availableDatabases={databases}
                                onEnvironmentChange={(env) => {
                                    queryTabsRef.current?.updateTabEnvironment(
                                        activeTab.id,
                                        env,
                                    );
                                }}
                                onDatabaseChange={(db) => {
                                    queryTabsRef.current?.updateTabDatabase(
                                        activeTab.id,
                                        db,
                                    );
                                }}
                                onReadOnlyToggle={() => {
                                    queryTabsRef.current?.toggleTabReadOnly(
                                        activeTab.id,
                                    );
                                }}
                            />
                        )}

                        {/* SQL Editor - Resizable */}
                        <div
                            className="flex-shrink-0 flex flex-col"
                            style={{ height: `${layout.editorHeight}px` }}
                        >
                            <div className="flex-1 min-h-0 overflow-hidden">
                                {activeTab && (
                                    <SQLEditor
                                        value={activeTab.query}
                                        onChange={(val) => {
                                            queryTabsRef.current?.updateQuery(
                                                val || "",
                                            );
                                        }}
                                        isExecuting={exec.loading}
                                        executionError={Boolean(exec.error)}
                                        onRunQuery={(sql, selection) =>
                                            runActiveTab({ sql, selection })
                                        }
                                        tableColumns={schema.editorTableColumns}
                                        databases={databases}
                                        contextVariables={editorContextVariables}
                                    />
                                )}
                            </div>

                            <RunStrip
                                workspaceMode={activeTab?.mode === "workspace"}
                                hasQuery={Boolean(activeTab?.query.trim())}
                                loading={exec.loading}
                                executionTime={exec.executionTime}
                                loadingTables={schema.loadingTables}
                                onSaveTemplate={templates.saveTemplate}
                                onSaveQuery={() => {
                                    setSaveQueryModalSeed((seed) => seed + 1);
                                    setSaveQueryModalOpen(true);
                                }}
                                onRefreshSchema={() => schema.refreshSchema(true)}
                                onRun={() => runActiveTab()}
                                onCancel={exec.cancelQuery}
                                onExplain={() => runActiveTab({ explain: true })}
                            />
                        </div>

                        {/* Resize Handle */}
                        <div
                            className="h-[4px] flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors border-b"
                            style={{
                                borderColor: "var(--border)",
                                background: "var(--border)",
                            }}
                            onMouseDown={layout.handleResizeStart}
                            title="Drag to resize editor"
                        />

                        {/* Results */}
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Query results show routing in the grid header. */}
                            <ResultBanners
                                routedDatabase={
                                    exec.explainResult ? routedDatabase : undefined
                                }
                                truncated={exec.result?.truncated}
                                rowCount={exec.result?.rowCount}
                                totalRows={exec.result?.totalRows}
                            />
                            <div className="flex-1 min-h-0">
                                {exec.explainResult ? (
                                    <ExplainView
                                        plan={exec.explainResult.explain}
                                        executionTime={
                                            exec.explainResult.executionTime
                                        }
                                    />
                                ) : (
                                    <ResultsTable
                                        result={exec.result}
                                        error={exec.error}
                                        loading={exec.loading}
                                        readOnly={activeTab?.readOnly ?? true}
                                        tableName={
                                            exec.currentTable
                                                ? displayTableName(
                                                      exec.currentTable,
                                                  )
                                                : undefined
                                        }
                                        tableView={exec.tableViewerState}
                                        onTableViewChange={exec.changeTableView}
                                        onRefreshTableView={
                                            exec.refreshTableView
                                        }
                                        onDeleteRow={
                                            exec.canDeleteRows
                                                ? exec.requestDeleteRow
                                                : undefined
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    </main>

                    <QueryHistory
                        items={history.items}
                        isOpen={sidePanel === "history"}
                        onToggle={() => togglePanel("history")}
                        onSelectQuery={(query) => {
                            queryTabsRef.current?.updateQuery(query);
                            setSidePanel(null);
                        }}
                        onDeleteItem={history.remove}
                        onClear={history.clear}
                    />

                    <SavedQueries
                        items={saved.items}
                        isOpen={sidePanel === "saved"}
                        onToggle={() => togglePanel("saved")}
                        onSelectQuery={handleSelectSavedQuery}
                        onDeleteItem={saved.remove}
                        onToggleStar={saved.toggleStar}
                    />

                    <ContextPanel
                        isOpen={sidePanel === "context"}
                        onToggle={() => togglePanel("context")}
                        profiles={contexts.profiles}
                        activeProfileId={contexts.activeProfileId}
                        environmentIds={environmentIds}
                        environmentNamesById={environmentNamesById}
                        onSetActiveProfile={contexts.setActiveProfile}
                        onSave={contexts.saveProfiles}
                    />
                </div>

                <ContextModal
                    isOpen={contextModalOpen}
                    onToggle={() => setContextModalOpen((prev) => !prev)}
                    onClose={() => setContextModalOpen(false)}
                    profiles={contexts.profiles}
                    activeProfileId={contexts.activeProfileId}
                    environmentIds={environmentIds}
                    environmentNamesById={environmentNamesById}
                    onSetActiveProfile={contexts.setActiveProfile}
                    onSave={contexts.saveProfiles}
                    currentEnvironment={activeTab?.environment}
                />

                <StatusBar
                    environment={activeTab?.environment || ""}
                    database={activeTab?.database || ""}
                    readOnly={activeTab?.readOnly || false}
                    rowCount={exec.result?.rowCount}
                    executionTime={exec.executionTime}
                    latency={connection.latency}
                    connected={connection.connected}
                    production={
                        activeTab ? isProdEnvironment(activeTab.environment) : false
                    }
                    contextProfileName={contexts.activeProfile?.name}
                    onOpenContext={() => setContextModalOpen(true)}
                />
            </div>

            <KeyboardHelp />

            <SaveQueryModal
                key={saveQueryModalSeed}
                isOpen={saveQueryModalOpen}
                initialName={activeTab?.name || "Saved Query"}
                query={activeTab?.query || ""}
                environment={activeTab?.environment || defaultEnvironment}
                database={activeTab?.database || ""}
                mode={activeTab?.mode || "standard"}
                onSave={handleSaveQuery}
                onCancel={() => setSaveQueryModalOpen(false)}
            />

            {pendingWrite && (
                <ConfirmDialog
                    title="Production Write Warning"
                    message={
                        pendingWrite.mode === "workspace"
                            ? `You are about to execute a write query in workspace mode against the ${pendingWrite.environment.toUpperCase()} environment. The target database is routed from the query's table prefix. This operation cannot be undone. Are you sure you want to proceed?`
                            : `You are about to execute a write query in ${pendingWrite.environment.toUpperCase()} environment on database "${pendingWrite.database}". This operation cannot be undone. Are you sure you want to proceed?`
                    }
                    confirmLabel="Execute"
                    cancelLabel="Cancel"
                    isDangerous={true}
                    onConfirm={exec.confirmPendingWrite}
                    onCancel={exec.cancelPendingWrite}
                />
            )}

            {exec.deleteConfirm && (
                <ConfirmDialog
                    title="Delete Row"
                    message={`Delete this row from ${(activeTab?.environment ?? "").toUpperCase()} / ${exec.currentTable?.database ?? ""}? This cannot be undone.\n\n${exec.deleteConfirm.query}`}
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    isDangerous={true}
                    onConfirm={exec.confirmDelete}
                    onCancel={exec.cancelDelete}
                />
            )}
        </div>
    );
}
