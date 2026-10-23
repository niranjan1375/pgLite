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

function ChevronDown() {
    return (
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="1.5,3 4.5,6 7.5,3" />
        </svg>
    );
}

function Dropdown({
    items,
    activeItem,
    activeColor,
    onSelect,
    onClose,
}: {
    items: string[];
    activeItem: string;
    activeColor: string;
    onSelect: (item: string) => void;
    onClose: () => void;
}) {
    return (
        <div
            className="absolute top-full left-0 mt-0 z-50 border min-w-[160px] py-1"
            style={{
                background: "var(--panel-elevated)",
                borderColor: "var(--border-bright)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
            }}
        >
            {items.map((item) => (
                <button
                    key={item}
                    onClick={() => { onSelect(item); onClose(); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] tracking-wide transition-colors hover:bg-white/5"
                    style={{
                        color: item === activeItem ? activeColor : "var(--text-muted)",
                    }}
                >
                    {item === activeItem && (
                        <span style={{ color: activeColor, fontSize: "8px" }}>◆</span>
                    )}
                    {item !== activeItem && (
                        <span style={{ width: "8px", display: "inline-block" }} />
                    )}
                    {item}
                </button>
            ))}
        </div>
    );
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
    const isProd = environment.includes("uat") || environment.includes("prod");

    useEscapeKey(() => {
        setShowEnvMenu(false);
        setShowDbMenu(false);
    }, showEnvMenu || showDbMenu);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (envMenuRef.current && !envMenuRef.current.contains(e.target as Node)) {
                setShowEnvMenu(false);
            }
            if (dbMenuRef.current && !dbMenuRef.current.contains(e.target as Node)) {
                setShowDbMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div
            className="flex items-center gap-0 border-b flex-shrink-0 text-[11px] tracking-wide"
            style={{
                height: "32px",
                background: "var(--panel)",
                borderColor: isProd
                    ? `color-mix(in srgb, ${envColor} 19%, transparent)`
                    : "var(--border)",
            }}
        >
            {/* Environment selector */}
            <div className="relative h-full" ref={envMenuRef}>
                <button
                    onClick={() => { setShowEnvMenu(!showEnvMenu); setShowDbMenu(false); }}
                    className="flex items-center gap-1.5 h-full px-3 transition-all hover:bg-white/5"
                    style={{
                        color: envColor,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontSize: "11px",
                        borderRight: "1px solid var(--border)",
                        minWidth: "max-content",
                    }}
                >
                    {/* Neon indicator dot */}
                    <span
                        style={{
                            display: "inline-block",
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: envColor,
                            boxShadow: `0 0 0 3px color-mix(in srgb, ${envColor} 16%, transparent)`,
                            flexShrink: 0,
                        }}
                    />
                    {environment}
                    <ChevronDown />
                </button>
                {showEnvMenu && (
                    <Dropdown
                        items={availableEnvironments}
                        activeItem={environment}
                        activeColor={envColor}
                        onSelect={onEnvironmentChange}
                        onClose={() => setShowEnvMenu(false)}
                    />
                )}
            </div>

            {/* Database selector */}
            <div className="relative h-full" ref={dbMenuRef}>
                <button
                    onClick={() => { setShowDbMenu(!showDbMenu); setShowEnvMenu(false); }}
                    className="flex items-center gap-1.5 h-full px-3 transition-all hover:bg-white/5"
                    style={{
                        color: "var(--text-primary)",
                        borderRight: "1px solid var(--border)",
                        minWidth: "max-content",
                    }}
                >
                    {database || (
                        <span style={{ color: "var(--text-dim)" }}>loading…</span>
                    )}
                    <ChevronDown />
                </button>
                {showDbMenu && (
                    <Dropdown
                        items={availableDatabases}
                        activeItem={database}
                        activeColor="var(--accent)"
                        onSelect={onDatabaseChange}
                        onClose={() => setShowDbMenu(false)}
                    />
                )}
            </div>

            {/* Read-only indicator (non-interactive label) */}
            {readOnly && (
                <span
                    className="px-2 text-[10px] uppercase font-bold tracking-widest"
                    style={{
                        color: "var(--warning)",
                        borderRight: "1px solid var(--border)",
                        lineHeight: "32px",
                    }}
                >
                    readonly
                </span>
            )}

            {/* RO/RW toggle — pushed to the right */}
            <button
                onClick={onReadOnlyToggle}
                className="ml-auto flex items-center gap-1.5 px-3 h-full text-[10px] uppercase font-bold tracking-widest transition-all hover:bg-white/5"
                style={{
                    color: readOnly ? "var(--warning)" : "var(--text-dim)",
                    borderLeft: "1px solid var(--border)",
                }}
                title={readOnly ? "Switch to read-write" : "Switch to read-only"}
            >
                <span
                    style={{
                        display: "inline-block",
                        width: "5px",
                        height: "5px",
                        background: readOnly ? "var(--warning)" : "var(--text-dim)",
                        boxShadow: readOnly ? "0 0 5px var(--warning)" : "none",
                        flexShrink: 0,
                    }}
                />
                {readOnly ? "ro" : "rw"}
            </button>
        </div>
    );
}
