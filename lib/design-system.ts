/**
 * Brutal Hacker Minimal Design System
 * No softness. Sharp edges. High contrast. Monospace everything.
 */

export const colors = {
    // Base
    bg: "#0b0f14",
    panel: "#11161d",
    border: "#1f2630",
    textPrimary: "#e6edf3",
    textMuted: "#8b949e",

    // Accent (Electric Green - choose ONE)
    accent: "#00ff41",
    accentHover: "#00cc34",

    // Environment Colors (Strong, High Contrast)
    env: {
        dev: "#00c853",
        loadtest: "#00c853",
        sandbox: "#00bcd4",
        staging: "#ff9100",
        "vegapay-uat-snapshot": "#ff1744",
        "vegapay-uat": "#ff1744",
        "unity-uat": "#ff1744",
    },

    // Status
    error: "#ff4444",
    warning: "#ffaa00",
    success: "#00ff41",

    // Grid
    gridLine: "#1a1f28",
} as const;

export const typography = {
    // Full monospace stack
    mono: '"SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace',

    // Sizes
    xs: "11px",
    sm: "12px",
    base: "13px",
    md: "14px",
    lg: "16px",
} as const;

export const spacing = {
    // Minimal, intentional spacing
    xs: "2px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
} as const;

export const layout = {
    activityBar: "40px",
    statusBar: "26px",
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
