"use client";

import { useRef } from "react";
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
}

export default function SQLEditor({
    value,
    onChange,
    onRunQuery,
    tableColumns,
}: SQLEditorProps) {
    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
        null,
    );

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;

        // Add Cmd/Ctrl+Enter to run query
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const selection = editor.getSelection();
            const model = editor.getModel();

            // If there's a selection, use only the selected text
            if (selection && model && !selection.isEmpty()) {
                const selectedText = model.getValueInRange(selection);
                onRunQuery(selectedText);
            } else {
                // Otherwise, use the entire editor content
                const currentValue = editor.getValue();
                onRunQuery(currentValue);
            }
        });

        // Register SQL completion provider
        monaco.languages.registerCompletionItemProvider("sql", {
            provideCompletionItems: (
                model: monacoEditor.editor.ITextModel,
                position: monacoEditor.Position,
            ) => {
                const suggestions: monacoEditor.languages.CompletionItem[] = [];

                // Add table suggestions
                Object.keys(tableColumns).forEach((tableName) => {
                    const displayName = tableName.replace("public.", "");
                    suggestions.push({
                        label: displayName,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: displayName,
                        detail: `Table: ${tableName}`,
                        documentation: `${tableColumns[tableName].length} columns`,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn:
                                model.getWordUntilPosition(position)
                                    .startColumn,
                            endColumn: position.column,
                        },
                    });
                });

                // Add column suggestions for all tables
                Object.entries(tableColumns).forEach(([tableName, columns]) => {
                    columns.forEach((col) => {
                        suggestions.push({
                            label: col.name,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col.name,
                            detail: `Column: ${col.type}`,
                            documentation: `${tableName}.${col.name} (${col.type})${col.nullable === "YES" ? " NULL" : " NOT NULL"}`,
                            range: {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn:
                                    model.getWordUntilPosition(position)
                                        .startColumn,
                                endColumn: position.column,
                            },
                        });
                    });
                });

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
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn:
                                model.getWordUntilPosition(position)
                                    .startColumn,
                            endColumn: position.column,
                        },
                    });
                });

                return { suggestions };
            },
        });
    };

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
                fontSize: 13,
                lineNumbers: "on",
                roundedSelection: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                suggest: {
                    showKeywords: true,
                    showSnippets: true,
                },
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                },
            }}
        />
    );
}
