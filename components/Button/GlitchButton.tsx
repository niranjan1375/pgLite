import React from "react";
import "./GlitchButton.css";

interface GlitchButtonProps {
    children: React.ReactNode;
    tag?: string; // small number/tag shown on the button
    selected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

export default function GlitchButton({
    children,
    tag,
    selected = false,
    onClick,
    disabled = false,
    className = "",
}: GlitchButtonProps) {
    const handleClick = () => {
        if (disabled) return;
        onClick?.();
    };

    return (
        <div className={`glitch-container ${className}`}>
            <div
                className={`radio-wrapper ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
                onClick={handleClick}
            >
                <div className="btn" role="button" aria-disabled={disabled}>
                    <span aria-hidden>_</span>
                    <span className="btn__label">{children}</span>
                    <span className="btn__glitch" aria-hidden>
                        {typeof children === "string" ? `${children}` : ""}
                    </span>
                    {tag ? <label className="number">{tag}</label> : null}
                </div>
            </div>
        </div>
    );
}
