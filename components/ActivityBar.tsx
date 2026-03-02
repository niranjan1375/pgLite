"use client";

import { useState } from "react";

interface ActivityBarProps {
    onSectionChange?: (section: string) => void;
}

export default function ActivityBar({ onSectionChange }: ActivityBarProps) {
    const [activeSection, setActiveSection] = useState("explorer");

    const sections = [
        { id: "explorer", icon: "≡", label: "Explorer" },
        { id: "history", icon: "↻", label: "History" },
        { id: "settings", icon: "⚙", label: "Settings" },
    ];

    const handleClick = (id: string) => {
        setActiveSection(id);
        onSectionChange?.(id);
    };

    return (
        <div
            className="w-[40px] h-full flex flex-col items-center border-r"
            style={{
                background: "var(--bg)",
                borderColor: "var(--border)",
            }}
        >
            {sections.map((section) => (
                <button
                    key={section.id}
                    onClick={() => handleClick(section.id)}
                    className="w-full h-[40px] flex items-center justify-center text-[20px] transition-colors relative"
                    style={{
                        color:
                            activeSection === section.id
                                ? "var(--accent)"
                                : "var(--text-muted)",
                        background:
                            activeSection === section.id
                                ? "var(--panel)"
                                : "transparent",
                    }}
                    title={section.label}
                >
                    {section.icon}
                    {activeSection === section.id && (
                        <div
                            className="absolute left-0 top-0 bottom-0 w-[2px]"
                            style={{ background: "var(--accent)" }}
                        />
                    )}
                </button>
            ))}
        </div>
    );
}
