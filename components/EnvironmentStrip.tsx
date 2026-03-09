"use client";

import { useState, useEffect, useRef } from "react";
import { getEnvironmentColor } from "@/lib/design-system";
import { useEscapeKey } from "@/hooks/useKeyboard";

interface EnvironmentStripProps {
    environment: string;
    database: string;
    readOnly: boolean;
    availableEnvironments: string[];
    availableDatabases: string[];
    onEnvironmentChange: (env: string) => void;
    onDatabaseChange: (db: string) => void;
    onReadOnlyToggle: () => void;
}

export default function EnvironmentStrip({
    environment,
    database,
    readOnly,
    availableEnvironments,
    availableDatabases,
    onEnvironmentChange,
    onDatabaseChange,
    onReadOnlyToggle,
}: EnvironmentStripProps) {
    const [showEnvMenu, setShowEnvMenu] = useState(false);
    const [showDbMenu, setShowDbMenu] = useState(false);
    const envMenuRef = useRef<HTMLDivElement>(null);
    const dbMenuRef = useRef<HTMLDivElement>(null);

    const envColor = getEnvironmentColor(environment);

    // Close menus on Escape
    useEscapeKey(() => {
        setShowEnvMenu(false);
        setShowDbMenu(false);
    }, showEnvMenu || showDbMenu);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                envMenuRef.current &&
                !envMenuRef.current.contains(e.target as Node)
            ) {
                setShowEnvMenu(false);
            }
            if (
                dbMenuRef.current &&
                !dbMenuRef.current.contains(e.target as Node)
            ) {
                setShowDbMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div
            className="h-[32px] flex items-center gap-2 px-3 text-[11px] uppercase tracking-wide border-b"
            style={{
                background: "var(--panel)",
                borderColor: "var(--border)",
            }}
        >
            {/* Environment */}
            <div className="relative" ref={envMenuRef}>
                <button
                    onClick={() => setShowEnvMenu(!showEnvMenu)}
                    className="hover:opacity-80 transition-opacity flex items-center gap-1"
                    style={{ color: envColor }}
                >
                    {environment}
                    <span className="text-[8px]">▼</span>
                </button>
                {showEnvMenu && (
                    <div
                        className="absolute top-full left-0 mt-1 z-50 border"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                        }}
                    >
                        {availableEnvironments.map((env) => (
                            <button
                                key={env}
                                onClick={() => {
                                    onEnvironmentChange(env);
                                    setShowEnvMenu(false);
                                }}
                                className="block px-3 py-1.5 hover:bg-gray-800 text-left w-full whitespace-nowrap"
                                style={{
                                    color:
                                        env === environment
                                            ? envColor
                                            : "var(--text-muted)",
                                }}
                            >
                                {env}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <span style={{ color: "var(--border)" }}>│</span>

            {/* Database */}
            <div className="relative" ref={dbMenuRef}>
                <button
                    onClick={() => setShowDbMenu(!showDbMenu)}
                    className="hover:opacity-80 transition-opacity flex items-center gap-1"
                    style={{ color: "var(--text-primary)" }}
                >
                    {database || (
                        <span style={{ color: "var(--text-muted)" }}>
                            loading...
                        </span>
                    )}
                    <span className="text-[8px]">▼</span>
                </button>
                {showDbMenu && (
                    <div
                        className="absolute top-full left-0 mt-1 z-50 border max-h-64 overflow-auto"
                        style={{
                            background: "var(--panel)",
                            borderColor: "var(--border)",
                        }}
                    >
                        {availableDatabases.map((db) => (
                            <button
                                key={db}
                                onClick={() => {
                                    onDatabaseChange(db);
                                    setShowDbMenu(false);
                                }}
                                className="block px-3 py-1.5 hover:bg-gray-800 text-left w-full whitespace-nowrap"
                                style={{
                                    color:
                                        db === database
                                            ? "var(--accent)"
                                            : "var(--text-muted)",
                                }}
                            >
                                {db}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {readOnly && (
                <>
                    <span style={{ color: "var(--border)" }}>│</span>
                    <span style={{ color: "var(--warning)" }}>readonly</span>
                </>
            )}

            <button
                onClick={onReadOnlyToggle}
                className="ml-auto text-[10px] px-2 py-0.5 border hover:opacity-80 transition-opacity"
                style={{
                    borderColor: readOnly ? "var(--warning)" : "var(--border)",
                    color: readOnly ? "var(--warning)" : "var(--text-muted)",
                }}
            >
                {readOnly ? "🔒 RO" : "🔓 RW"}
            </button>
        </div>
    );
}
