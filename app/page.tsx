"use client";

import { useState, useCallback, useRef } from "react";

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
}

interface QueryError {
  error: string;
}

export default function Home() {
  const [query, setQuery] = useState("SELECT version();");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data: QueryResult | QueryError = await res.json();
      if ("error" in data) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
    },
    [runQuery]
  );

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-blue-400">pgLite</h1>
          <p className="text-xs text-gray-500 mt-0.5">PostgreSQL Admin</p>
        </div>
        <div className="p-4 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Schema Explorer
          </p>
          <p className="text-xs text-gray-600 italic">Coming soon…</p>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Editor area */}
        <div className="p-4 border-b border-gray-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-400">SQL Editor</label>
            <span className="text-xs text-gray-600">
              Ctrl+Enter / ⌘+Enter to run
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
            placeholder="Enter SQL query…"
            spellCheck={false}
            className="w-full rounded-lg bg-gray-900 border border-gray-700 text-gray-100
                       font-mono text-sm p-3 resize-y focus:outline-none focus:ring-2
                       focus:ring-blue-500 placeholder-gray-600"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={runQuery}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-sm font-semibold transition-colors"
            >
              {loading ? "Running…" : "Run Query"}
            </button>
            {result && (
              <span className="text-xs text-gray-500">
                {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} returned
              </span>
            )}
          </div>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="rounded-lg bg-red-950 border border-red-800 p-4 text-sm text-red-300 font-mono">
              <p className="font-semibold text-red-400 mb-1">Error</p>
              {error}
            </div>
          )}

          {result && result.fields.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    {result.fields.map((field) => (
                      <th
                        key={field}
                        className="px-4 py-2 text-left text-xs font-semibold
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
                      className="hover:bg-gray-900 transition-colors"
                    >
                      {result.fields.map((field) => (
                        <td
                          key={field}
                          className="px-4 py-2 text-gray-300 font-mono text-xs
                                     whitespace-nowrap max-w-xs truncate"
                          title={String(row[field] ?? "")}
                        >
                          {row[field] === null ? (
                            <span className="text-gray-600 italic">NULL</span>
                          ) : (
                            String(row[field])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.fields.length === 0 && (
            <div className="rounded-lg bg-green-950 border border-green-800 p-4 text-sm text-green-300">
              Query executed successfully.{" "}
              {result.rowCount > 0 && `${result.rowCount} row(s) affected.`}
            </div>
          )}

          {!result && !error && !loading && (
            <p className="text-gray-600 text-sm">
              Run a query to see results here.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
