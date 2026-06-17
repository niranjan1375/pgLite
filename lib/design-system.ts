/**
 * Cyberpunk Dev Tool Design System
 * Dark. Neon. Sharp. Developer-grade.
 */

export const colors = {
    // Base
    bg: "#080c12",
    panel: "#0b0f18",
    panelElevated: "#0f1520",
    border: "#16202e",
    borderBright: "#1e3048",
    textPrimary: "#b8d0e8",
    textMuted: "#3d5570",

    // Primary Accent — Neon Green
    accent: "#00ff88",
    accentHover: "#00cc70",

    // Secondary — Cyan
    cyan: "#00e5ff",

    // Environment Colors
    env: {
        dev: "#00ff88",
        loadtest: "#00ff88",
        sandbox: "#00e5ff",
        staging: "#ff9500",
        "vegapay-uat-snapshot": "#ff2d55",
        "vegapay-uat": "#ff2d55",
        "unity-uat": "#ff2d55",
    },

    // Status
    error: "#ff2d55",
    warning: "#ff9500",
    success: "#00ff88",
} as const;

export const typography = {
    mono: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace',
    xs: "11px",
    sm: "12px",
    base: "13px",
    md: "14px",
    lg: "16px",
} as const;

export const spacing = {
    xs: "2px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
} as const;

export const layout = {
    activityBar: "44px",
    statusBar: "28px",
    rowHeight: "32px",
    borderWidth: "1px",
    tabsHeight: "36px",
    environmentStripHeight: "32px",
    editorHeight: "280px",
    explorerWidth: "240px",
    tableRowHeight: "41px",
    tableOverscan: 5,
} as const;

export function getEnvironmentColor(envId: string): string {
    return colors.env[envId as keyof typeof colors.env] || colors.accent;
}

export function getEnvironmentGlow(envId: string): string {
    const color = getEnvironmentColor(envId);
    return `0 0 8px ${color}66, 0 0 20px ${color}22`;
}
