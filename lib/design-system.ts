/**
 * pgLite design tokens.
 *
 * The source of truth for the *palette* is the [data-theme] blocks in
 * app/globals.css. Anything color-related here returns CSS variable
 * references (e.g. `var(--env-staging)`) so it follows the active theme —
 * never hardcode a hex in a component.
 */

export const colors = {
    bg: "var(--bg)",
    panel: "var(--panel)",
    panelElevated: "var(--panel-elevated)",
    border: "var(--border)",
    borderBright: "var(--border-bright)",
    textPrimary: "var(--text-primary)",
    textMuted: "var(--text-muted)",

    accent: "var(--accent)",
    accentHover: "var(--accent-hover)",
    cyan: "var(--cyan)",

    error: "var(--error)",
    warning: "var(--warning)",
    success: "var(--success)",
} as const;

export const typography = {
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
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
    activityBar: "46px",
    statusBar: "26px",
    rowHeight: "30px",
    borderWidth: "1px",
    tabsHeight: "36px",
    environmentStripHeight: "32px",
    editorHeight: "280px",
    explorerWidth: "256px",
    tableRowHeight: "32px",
    tableOverscan: 12,
} as const;

/** Maps an environment id to the CSS variable that carries its color. */
const ENV_COLOR_VAR: Record<string, string> = {
    dev: "--env-dev",
    loadtest: "--env-loadtest",
    sandbox: "--env-sandbox",
    staging: "--env-staging",
    "vegapay-uat-snapshot": "--env-uat",
    "vegapay-uat": "--env-uat",
    "unity-uat": "--env-uat",
};

/** Returns a theme-aware CSS color reference for an environment. */
export function getEnvironmentColor(envId: string): string {
    const variable = ENV_COLOR_VAR[envId] ?? "--accent";
    return `var(${variable})`;
}

/** Subtle, theme-aware ring for the active environment indicator. */
export function getEnvironmentGlow(envId: string): string {
    const color = getEnvironmentColor(envId);
    return `0 0 0 3px color-mix(in srgb, ${color} 16%, transparent)`;
}
