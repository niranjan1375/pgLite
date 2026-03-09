"use client";

import { useRef, useEffect, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

interface StatementInfo {
    text: string;
    startLine: number;
    endLine: number;
}

const RUNNABLE_SQL_PREFIXES = [
    "SELECT",
    "WITH",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "TRUNCATE",
    "MERGE",
    "CALL",
    "EXPLAIN",
    "VALUES",
] as const;

function isRunnableSqlStatement(text: string): boolean {
    const normalized = text.trim().toUpperCase();
    if (!normalized || normalized.startsWith("--")) {
        return false;
    }

    return RUNNABLE_SQL_PREFIXES.some((prefix) =>
        normalized.startsWith(prefix),
    );
}

interface Column {
    name: string;
    type: string;
    nullable: string;
}

interface SQLEditorProps {
    value: string;
    onChange: (value: string) => void;
    isExecuting?: boolean;
    executionError?: boolean;
    onRunQuery: (
        query: string,
        context?: {
            isSelection: boolean;
            selectionStartLineNumber?: number;
        },
    ) => void;
    tableColumns: Record<string, Column[]>;
    databases?: string[]; // Available databases for workspace mode autocomplete
}

function extractEditorVariables(
    model: monacoEditor.editor.ITextModel,
): string[] {
    const variableNames: string[] = [];
    const variableNameSet = new Set<string>();
    const totalLines = model.getLineCount();

    for (let line = 1; line <= totalLines; line++) {
        const lineContent = model.getLineContent(line).trim();

        if (!lineContent.startsWith("@")) {
            break;
        }

        const match = lineContent.match(/^@([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (!match) {
            continue;
        }

        const variableName = match[1];
        if (!variableNameSet.has(variableName)) {
            variableNameSet.add(variableName);
            variableNames.push(variableName);
        }
    }

    return variableNames;
}

function getStatements(model: monacoEditor.editor.ITextModel): StatementInfo[] {
    const statements: StatementInfo[] = [];

    let variableBlockEndLine = 0;
    const totalLines = model.getLineCount();
    for (let line = 1; line <= totalLines; line++) {
        const lineContent = model.getLineContent(line).trim();
        if (lineContent.startsWith("@")) {
            variableBlockEndLine = line;
            continue;
        }
        break;
    }

    let currentStatement = "";
    let currentStartLine: number | null = null;

    const pushStatement = (endLine: number) => {
        const trimmed = currentStatement.trim();
        if (!trimmed || currentStartLine === null) {
            currentStatement = "";
            currentStartLine = null;
            return;
        }

        if (!isRunnableSqlStatement(trimmed)) {
            currentStatement = "";
            currentStartLine = null;
            return;
        }

        statements.push({
            text: trimmed,
            startLine: currentStartLine,
            endLine,
        });

        currentStatement = "";
        currentStartLine = null;
    };

    for (let line = variableBlockEndLine + 1; line <= totalLines; line++) {
        const lineContent = model.getLineContent(line);

        if (currentStartLine === null && lineContent.trim()) {
            currentStartLine = line;
        }

        let segmentStart = 0;
        for (let index = 0; index < lineContent.length; index++) {
            if (lineContent[index] !== ";") {
                continue;
            }

            currentStatement += lineContent.slice(segmentStart, index);
            pushStatement(line);
            segmentStart = index + 1;

            if (lineContent.slice(segmentStart).trim()) {
                currentStartLine = line;
            }
        }

        currentStatement += lineContent.slice(segmentStart);
        if (line < totalLines) {
            currentStatement += "\n";
        }
    }

    if (currentStatement.trim()) {
        pushStatement(totalLines);
    }

    return statements;
}

export default function SQLEditor({
    value,
    onChange,
    isExecuting = false,
    executionError = false,
    onRunQuery,
    tableColumns,
    databases = [],
}: SQLEditorProps) {
    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
        null,
    );
    const monacoRef = useRef<typeof monacoEditor | null>(null);
    const completionProviderRef = useRef<monacoEditor.IDisposable | null>(null);
    const statementDecorationIdsRef = useRef<string[]>([]);
    const statementsRef = useRef<StatementInfo[]>([]);
    const mouseDownDisposableRef = useRef<monacoEditor.IDisposable | null>(
        null,
    );
    const contentChangeDisposableRef = useRef<monacoEditor.IDisposable | null>(
        null,
    );
    const onRunQueryRef = useRef(onRunQuery);
    const isExecutingRef = useRef(isExecuting);
    const previousExecutingRef = useRef(isExecuting);
    const lastTriggerAtRef = useRef(0);
    const activeRunLineRef = useRef<number | null>(null);
    const runStateRef = useRef<"idle" | "running" | "success" | "failure">(
        "idle",
    );
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const refreshDecorationsRef = useRef<(() => void) | null>(null);

    const isStatementGlyphClick = useCallback(
        (event: monacoEditor.editor.IEditorMouseEvent) => {
            const element = event.target.element as HTMLElement | null;
            if (!element) return false;

            if (element.classList.contains("statement-run-glyph")) {
                return true;
            }

            return Boolean(element.closest(".statement-run-glyph"));
        },
        [],
    );

    useEffect(() => {
        onRunQueryRef.current = onRunQuery;
    }, [onRunQuery]);

    useEffect(() => {
        const wasExecuting = previousExecutingRef.current;
        previousExecutingRef.current = isExecuting;
        isExecutingRef.current = isExecuting;

        if (!wasExecuting && isExecuting) {
            runStateRef.current = "running";
            refreshDecorationsRef.current?.();
            return;
        }

        if (wasExecuting && !isExecuting && activeRunLineRef.current !== null) {
            // If parent passed an execution error flag, show failure, otherwise success
            runStateRef.current = executionError ? "failure" : "success";
            refreshDecorationsRef.current?.();
        }
    }, [isExecuting, executionError]);

    const triggerRun = useCallback(
        (
            query: string,
            context?: {
                isSelection: boolean;
                selectionStartLineNumber?: number;
            },
        ) => {
            const now = Date.now();
            if (now - lastTriggerAtRef.current < 300) {
                return;
            }

            if (isExecutingRef.current) {
                return;
            }

            // Clear any previous success state when starting a new execution
            if (runStateRef.current === "success") {
                runStateRef.current = "idle";
                activeRunLineRef.current = null;
            }

            if (typeof context?.selectionStartLineNumber === "number") {
                activeRunLineRef.current = context.selectionStartLineNumber;
            }
            runStateRef.current = "running";
            refreshDecorationsRef.current?.();

            lastTriggerAtRef.current = now;
            onRunQueryRef.current(query, context);
        },
        [],
    );

    // Function to register/update completion provider
    const registerCompletionProvider = useCallback(
        (monaco: typeof monacoEditor) => {
            // Dispose previous completion provider
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }

            // Register new completion provider
            completionProviderRef.current =
                monaco.languages.registerCompletionItemProvider("sql", {
                    triggerCharacters: [".", " ", "@"], // Trigger on dot, space, and variable prefix
                    provideCompletionItems: (
                        model: monacoEditor.editor.ITextModel,
                        position: monacoEditor.Position,
                    ) => {
                        const suggestions: monacoEditor.languages.CompletionItem[] =
                            [];
                        const editorVariables = extractEditorVariables(model);
                        const wordInfo = model.getWordUntilPosition(position);
                        const range = {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: wordInfo.startColumn,
                            endColumn: position.column,
                        };

                        // Add workspace variable suggestions based on @var = value block at top
                        editorVariables.forEach((variableName) => {
                            suggestions.push({
                                label: `@${variableName}`,
                                kind: monaco.languages.CompletionItemKind
                                    .Variable,
                                insertText: `@${variableName}`,
                                detail: "Workspace variable",
                                documentation: `Variable defined in query header: @${variableName} = ...`,
                                range,
                                sortText: `0_@${variableName}`,
                            });
                        });

                        suggestions.push({
                            label: "@variable = value",
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: "@${1:variable_name} = ${2:value}",
                            insertTextRules:
                                monaco.languages.CompletionItemInsertTextRule
                                    .InsertAsSnippet,
                            detail: "Workspace variable definition",
                            documentation:
                                "Define variables at the top of the query. Example: @user_id = 123",
                            range,
                            sortText: "0_@@snippet",
                        });

                        // Add database name suggestions (for workspace mode)
                        databases.forEach((dbName) => {
                            suggestions.push({
                                label: dbName,
                                kind: monaco.languages.CompletionItemKind
                                    .Module,
                                insertText: `${dbName}.`,
                                detail: "Database (workspace mode)",
                                documentation: `Use ${dbName}.table_name for workspace mode routing`,
                                range,
                                sortText: `0_${dbName}`,
                            });
                        });

                        // Add table suggestions
                        Object.keys(tableColumns).forEach((tableName) => {
                            const displayName = tableName.replace(
                                "public.",
                                "",
                            );
                            suggestions.push({
                                label: displayName,
                                kind: monaco.languages.CompletionItemKind.Class,
                                insertText: displayName,
                                detail: `Table: ${tableName}`,
                                documentation: `${tableColumns[tableName].length} columns`,
                                range,
                                sortText: `1_${displayName}`,
                            });
                        });

                        // Add column suggestions
                        Object.entries(tableColumns).forEach(
                            ([tableName, columns]) => {
                                columns.forEach((col) => {
                                    suggestions.push({
                                        label: col.name,
                                        kind: monaco.languages
                                            .CompletionItemKind.Field,
                                        insertText: col.name,
                                        detail: `Column: ${col.type}`,
                                        documentation: `${tableName}.${col.name} (${col.type})${col.nullable === "YES" ? " NULL" : " NOT NULL"}`,
                                        range,
                                        sortText: `2_${col.name}`,
                                    });
                                });
                            },
                        );

                        // Add SQL keywords
                        const keywords = [
                            "SELECT",
                            "FROM",
                            "WHERE",
                            "INSERT",
                            "UPDATE",
                            "DELETE",
                            "JOIN",
                            "INNER",
                            "LEFT",
                            "RIGHT",
                            "OUTER",
                            "ON",
                            "GROUP BY",
                            "ORDER BY",
                            "LIMIT",
                            "OFFSET",
                            "AS",
                            "AND",
                            "OR",
                            "NOT",
                            "IN",
                            "LIKE",
                            "BETWEEN",
                            "NULL",
                            "IS",
                            "CREATE",
                            "DROP",
                            "ALTER",
                            "TABLE",
                        ];

                        keywords.forEach((keyword) => {
                            suggestions.push({
                                label: keyword,
                                kind: monaco.languages.CompletionItemKind
                                    .Keyword,
                                insertText: keyword,
                                range,
                                sortText: `3_${keyword}`,
                            });
                        });

                        return { suggestions };
                    },
                });
        },
        [databases, tableColumns],
    );

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        const updateStatementRunDecorations = () => {
            const model = editor.getModel();
            if (!model) return;

            const statements = getStatements(model);
            statementsRef.current = statements;

            const newDecorations: monacoEditor.editor.IModelDeltaDecoration[] =
                statements.map((statement) => {
                    const isActiveRunLine =
                        activeRunLineRef.current === statement.startLine;

                    // Determine icon and state class based on runState
                    let iconClass = "codicon-play";
                    let stateClass = "";

                    if (isActiveRunLine) {
                        if (runStateRef.current === "running") {
                            iconClass = "codicon-play"; // CSS spins it
                            stateClass = " statement-run-glyph--running";
                        } else if (runStateRef.current === "success") {
                            iconClass = "codicon-check";
                            stateClass = " statement-run-glyph--success";
                        } else if (runStateRef.current === "failure") {
                            iconClass = "codicon-remove";
                            stateClass = " statement-run-glyph--failure";
                        }
                    }

                    return {
                        range: new monaco.Range(
                            statement.startLine,
                            1,
                            statement.startLine,
                            1,
                        ),
                        options: {
                            isWholeLine: true,
                            glyphMarginClassName: `statement-run-glyph codicon ${iconClass}${stateClass}`,
                            glyphMarginHoverMessage: {
                                value: "Run statement",
                            },
                        },
                    };
                });

            statementDecorationIdsRef.current = editor.deltaDecorations(
                statementDecorationIdsRef.current,
                newDecorations,
            );
        };

        refreshDecorationsRef.current = updateStatementRunDecorations;

        // Helper function to extract query at cursor position
        const getQueryAtCursor = () => {
            const model = editor.getModel();
            if (!model) return null;

            const position = editor.getPosition();
            if (!position) return null;

            const statements = getStatements(model);
            const statementAtCursor = statements.find(
                (statement) =>
                    position.lineNumber >= statement.startLine &&
                    position.lineNumber <= statement.endLine,
            );

            return statementAtCursor?.text ?? null;
        };

        // Add Cmd/Ctrl+Enter to run query
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const selection = editor.getSelection();
            const model = editor.getModel();

            // Priority 1: If there's a selection, use only the selected text
            if (selection && model && !selection.isEmpty()) {
                const selectedText = model.getValueInRange(selection);
                triggerRun(selectedText.trim(), {
                    isSelection: true,
                    selectionStartLineNumber: selection.startLineNumber,
                });
            } else {
                // Priority 2: Find and run the query at cursor position
                const queryAtCursor = getQueryAtCursor();
                if (queryAtCursor) {
                    triggerRun(queryAtCursor, {
                        isSelection: false,
                    });
                }
            }
        });

        mouseDownDisposableRef.current = editor.onMouseDown((event) => {
            const isGutterTarget =
                event.target.type ===
                    monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                event.target.type ===
                    monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
                event.target.type ===
                    monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;

            // Prevent interaction while a statement is running
            if (runStateRef.current === "running") {
                return;
            }

            if (!isGutterTarget || !isStatementGlyphClick(event)) {
                return;
            }

            const clickedLine = event.target.position?.lineNumber;
            if (!clickedLine) return;

            const statement = statementsRef.current.find(
                (item) =>
                    clickedLine >= item.startLine &&
                    clickedLine <= item.endLine,
            );

            if (!statement) return;

            triggerRun(statement.text, {
                isSelection: false,
                selectionStartLineNumber: statement.startLine,
            });
        });

        contentChangeDisposableRef.current = editor.onDidChangeModelContent(
            () => {
                updateStatementRunDecorations();
            },
        );

        updateStatementRunDecorations();

        // Register completion provider on mount
        registerCompletionProvider(monaco);
    };

    // Register SQL completion provider - re-register when dependencies change
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;

        // Re-register completion provider with updated data
        registerCompletionProvider(monaco);

        // Cleanup only completion provider for this re-registration cycle
        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }
        };
    }, [registerCompletionProvider]);

    useEffect(() => {
        return () => {
            if (contentChangeDisposableRef.current) {
                contentChangeDisposableRef.current.dispose();
                contentChangeDisposableRef.current = null;
            }

            if (mouseDownDisposableRef.current) {
                mouseDownDisposableRef.current.dispose();
                mouseDownDisposableRef.current = null;
            }

            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
            }

            const editor = editorRef.current;
            if (editor) {
                editor.deltaDecorations(statementDecorationIdsRef.current, []);
            }
            statementDecorationIdsRef.current = [];
            statementsRef.current = [];
            refreshDecorationsRef.current = null;
        };
    }, []);

    return (
        <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={value}
            onChange={(newValue) => {
                if (newValue !== undefined) {
                    onChange(newValue);
                }
            }}
            onMount={handleEditorDidMount}
            options={{
                minimap: { enabled: false },
                glyphMargin: true,
                fontSize: 12,
                fontFamily:
                    "'SF Mono', 'Monaco', 'Inconsolata', 'Consolas', monospace",
                lineNumbers: "on",
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                lineHeight: 18,
                padding: { top: 8, bottom: 8 },
                suggest: {
                    showKeywords: true,
                    showSnippets: true,
                    showClasses: true,
                    showFields: true,
                    showModules: true,
                    insertMode: "replace",
                },
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                },
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: "on",
                tabCompletion: "on",
            }}
        />
    );
}
