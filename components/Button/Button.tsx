import React from "react";
import "./Button.css";

export interface ButtonProps {
    id?: string;
    children?: React.ReactNode;
    variant?: "cyber" | "primary" | "default";
    onClick?: () => void;
    selected?: boolean;
    className?: string;
}

const Button: React.FC<ButtonProps> = ({
    id,
    children,
    variant = "cyber",
    onClick,
    selected = false,
    className = "",
}) => {
    return (
        <button
            id={id}
            className={`cyber-btn ${variant} ${selected ? "is-selected" : ""} ${className}`}
            onClick={onClick}
            aria-pressed={selected}
        >
            <span className="cyber-btn__label">{children}</span>
            <span className="cyber-btn__glitch" aria-hidden>
                {/* show a simple glitch suffix when children is a plain string */}
                {typeof children === "string" ? `${children}_` : ""}
            </span>
        </button>
    );
};

export default Button;
