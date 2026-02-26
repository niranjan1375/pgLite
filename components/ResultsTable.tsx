"use client";

import { useState } from "react";

interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: string[];
}

interface ResultsTableProps {
    result: QueryResult | null;
    error: string | null;
    loading: boolean;
}

export default function ResultsTable({
    result,
    error,
    loading,
}: ResultsTableProps) {
    const [copiedCell, setCopiedCell] = useState<string | null>(null);

    const copyToClipboard = (text: string, cellId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedCell(cellId);
        setTimeout(() => setCopiedCell(null), 2000);
    };

    const exportAsCSV = () => {
        if (!result || result.rows.length === 0) return;

        const headers = result.fields.join(",");
        const rows = result.rows.map((row) =>
            result.fields
                .map((field) => {
                    const value = row[field];
                    if (value === null) return "NULL";
                    const str = String(value);
                    // Escape quotes and wrap in quotes if contains comma
                    if (str.includes(",") || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                })
                .join(","),
        );

        const csv = [headers, ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `query-result-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportAsJSON = () => {
        if (!result || result.rows.length === 0) return;

        const json = JSON.stringify(result.rows, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `query-result-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32 text-gray-500">
                <div className="flex items-center gap-2">
                    <svg
                        className="animate-spin w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <span className="text-sm">Executing query...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg bg-red-950 border border-red-800 p-4 text-sm text-red-300 font-mono">
                <div className="flex items-start gap-2">
                    <svg
                        className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <div>
                        <p className="font-semibold text-red-400 mb-1">
                            Query Error
                        </p>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                <svg
                    className="w-12 h-12 mb-2 text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                </svg>
                <p className="text-sm">Run a query to see results</p>
            </div>
        );
    }

    if (result.fields.length === 0) {
        return (
            <div className="rounded-lg bg-green-950 border border-green-800 p-4 text-sm text-green-300">
                <div className="flex items-center gap-2">
                    <svg
                        className="w-5 h-5 text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span>
                        Query executed successfully.{" "}
                        {result.rowCount > 0 &&
                            `${result.rowCount} row(s) affected.`}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Results Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">
                        {result.rowCount.toLocaleString()} row
                        {result.rowCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-gray-600">
                        {result.fields.length} column
                        {result.fields.length !== 1 ? "s" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportAsJSON}
                        className="px-3 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700
                                   text-gray-300 flex items-center gap-1.5 transition-colors"
                        title="Export as JSON"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        JSON
                    </button>
                    <button
                        onClick={exportAsCSV}
                        className="px-3 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700
                                   text-gray-300 flex items-center gap-1.5 transition-colors"
                        title="Export as CSV"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        CSV
                    </button>
                </div>
            </div>

            {/* Results Table */}
            <div className="flex-1 overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-900 sticky top-0 z-10">
                        <tr>
                            {result.fields.map((field) => (
                                <th
                                    key={field}
                                    className="px-4 py-2.5 text-left text-xs font-semibold
                                               text-gray-400 uppercase tracking-wider
                                               border-b border-gray-800 whitespace-nowrap"
                                >
                                    {field}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {result.rows.map((row, rowIdx) => (
                            <tr
                                key={rowIdx}
                                className="hover:bg-gray-900/50 transition-colors"
                            >
                                {result.fields.map((field) => {
                                    const cellId = `${rowIdx}-${field}`;
                                    const value = row[field];
                                    const displayValue =
                                        value === null ? "NULL" : String(value);

                                    return (
                                        <td
                                            key={field}
                                            className="px-4 py-2 text-gray-300 font-mono text-xs
                                                       whitespace-nowrap group relative"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`truncate max-w-xs ${
                                                        value === null
                                                            ? "text-gray-600 italic"
                                                            : ""
                                                    }`}
                                                    title={displayValue}
                                                >
                                                    {displayValue}
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        copyToClipboard(
                                                            displayValue,
                                                            cellId,
                                                        )
                                                    }
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded
                                                               hover:bg-gray-800 text-gray-500 hover:text-gray-300
                                                               transition-all"
                                                    title="Copy value"
                                                >
                                                    {copiedCell === cellId ? (
                                                        <svg
                                                            className="w-3 h-3 text-green-400"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    ) : (
                                                        <svg
                                                            className="w-3 h-3"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
