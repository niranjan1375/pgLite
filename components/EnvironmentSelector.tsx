"use client";

import { useState, useEffect } from "react";

interface EnvironmentSelectorProps {
    onEnvironmentChange?: (env: string) => void;
}

const environments = [
    {
        id: "loadtest",
        name: "Loadtest Azure",
        color: "bg-cyan-500",
        requiresVPN: false,
    },
    {
        id: "sandbox",
        name: "Sandbox",
        color: "bg-yellow-500",
        requiresVPN: false,
    },
    {
        id: "staging",
        name: "Staging",
        color: "bg-orange-500",
        requiresVPN: false,
    },
    {
        id: "vegapay-uat-snapshot",
        name: "VegaPay UAT Snapshot",
        color: "bg-purple-500",
        requiresVPN: true,
    },
    {
        id: "vegapay-uat",
        name: "VegaPay UAT",
        color: "bg-blue-500",
        requiresVPN: true,
    },
    {
        id: "unity-uat",
        name: "Unity UAT",
        color: "bg-indigo-500",
        requiresVPN: true,
    },
    {
        id: "dev",
        name: "Development (Local)",
        color: "bg-green-500",
        requiresVPN: false,
    },
];

export default function EnvironmentSelector({
    onEnvironmentChange,
}: EnvironmentSelectorProps) {
    const [selectedEnv, setSelectedEnv] = useState<string>(() => {
        // Initialize from localStorage only on client-side
        if (typeof window !== "undefined") {
            return localStorage.getItem("selectedEnvironment") || "loadtest";
        }
        return "loadtest";
    });
    const [isOpen, setIsOpen] = useState(false);

    // Notify parent of initial environment on mount
    useEffect(() => {
        const initialEnv =
            (typeof window !== "undefined" &&
                localStorage.getItem("selectedEnvironment")) ||
            "loadtest";
        onEnvironmentChange?.(initialEnv);
    }, [onEnvironmentChange]);

    const handleEnvironmentChange = (envId: string) => {
        setSelectedEnv(envId);
        localStorage.setItem("selectedEnvironment", envId);
        setIsOpen(false);
        onEnvironmentChange?.(envId);
    };

    const currentEnv = environments.find((e) => e.id === selectedEnv);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
            >
                <div
                    className={`w-3 h-3 rounded-full ${currentEnv?.color || "bg-gray-500"}`}
                />
                <span className="text-sm font-medium text-gray-200">
                    {currentEnv?.name || "Select Environment"}
                </span>
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    {environments.map((env) => (
                        <button
                            key={env.id}
                            onClick={() => handleEnvironmentChange(env.id)}
                            className={`w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                selectedEnv === env.id ? "bg-gray-700" : ""
                            }`}
                        >
                            <div
                                className={`w-3 h-3 rounded-full ${env.color}`}
                            />
                            <span className="text-sm text-gray-200">
                                {env.name}
                            </span>
                            {env.requiresVPN && (
                                <span
                                    className="text-xs text-amber-400 ml-1"
                                    title="Requires VPN"
                                >
                                    🔒
                                </span>
                            )}
                            {selectedEnv === env.id && (
                                <svg
                                    className="w-4 h-4 ml-auto text-green-500"
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
                            )}
                        </button>
                    ))}
                </div>
            )}

            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
