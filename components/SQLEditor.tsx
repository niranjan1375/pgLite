"use client";

import { useRef, useEffect, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

interface Column {
    name: string;
    type: string;
    nullable: string;
}

interface SQLEditorProps {
    value: string;
    onChange: (value: string) => void;
    onRunQuery: (query: string) => void;
    tableColumns: Record<string, Column[]>;
    databases?: string[]; // Available databases for workspace mode autocomplete
}

export default function SQLEditor({
    value,
    onChange,
    onRunQuery,
    tableColumns,
    databases = [],
}: SQLEditorProps) {
    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
        null,
    );
    const monacoRef = useRef<typeof monacoEditor | null>(null);
    const completionProviderRef = useRef<monacoEditor.IDisposable | null>(null);

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
                    triggerCharacters: [".", " "], // Trigger on dot and space
                    provideCompletionItems: (
                        model: monacoEditor.editor.ITextModel,
                        position: monacoEditor.Position,
                    ) => {
                        const suggestions: monacoEditor.languages.CompletionItem[] =
                            [];
                        const wordInfo = model.getWordUntilPosition(position);
                        const range = {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: wordInfo.startColumn,
                            endColumn: position.column,
                        };

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

        // Helper function to extract query at cursor position
        const getQueryAtCursor = () => {
            const model = editor.getModel();
            if (!model) return null;

            const position = editor.getPosition();
            if (!position) return null;

            const fullText = model.getValue();
            const cursorOffset = model.getOffsetAt(position);

            // Split by semicolon to get individual queries
            const queries: Array<{
                query: string;
                start: number;
                end: number;
            }> = [];
            let currentStart = 0;

            // Parse queries separated by semicolons
            const parts = fullText.split(";");
            parts.forEach((part) => {
                const query = part.trim();
                if (query) {
                    const start = currentStart;
                    const end = currentStart + part.length;
                    queries.push({ query, start, end });
                }
                currentStart += part.length + 1; // +1 for semicolon
            });

            // Find which query contains the cursor
            for (const { query, start, end } of queries) {
                if (cursorOffset >= start && cursorOffset <= end) {
                    return query;
                }
            }

            // If no semicolon-separated query found, return entire content
            return fullText.trim() || null;
        };

        // Add Cmd/Ctrl+Enter to run query
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const selection = editor.getSelection();
            const model = editor.getModel();

            // Priority 1: If there's a selection, use only the selected text
            if (selection && model && !selection.isEmpty()) {
                const selectedText = model.getValueInRange(selection);
                onRunQuery(selectedText.trim());
            } else {
                // Priority 2: Find and run the query at cursor position
                const queryAtCursor = getQueryAtCursor();
                if (queryAtCursor) {
                    onRunQuery(queryAtCursor);
                }
            }
        });

        // Register completion provider on mount
        registerCompletionProvider(monaco);
    };

    // Register SQL completion provider - re-register when dependencies change
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;

        // Re-register completion provider with updated data
        registerCompletionProvider(monaco);

        // Cleanup on unmount
        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }
        };
    }, [registerCompletionProvider]);

    return (
        <Editor
            height="200px"
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
