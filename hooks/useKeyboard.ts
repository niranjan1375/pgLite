/**
 * Centralized keyboard shortcut manager
 */
import { useEffect } from "react";

export interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    description: string;
    handler: () => void;
}

export function useKeyboard(shortcuts: KeyboardShortcut[], enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                const ctrlMatch = shortcut.ctrl
                    ? e.ctrlKey || e.metaKey
                    : !e.ctrlKey && !e.metaKey;
                const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
                const altMatch = shortcut.alt ? e.altKey : !e.altKey;

                if (
                    e.key.toLowerCase() === shortcut.key.toLowerCase() &&
                    ctrlMatch &&
                    shiftMatch &&
                    altMatch
                ) {
                    // Stop the event before Monaco / the browser act on it
                    // (e.g. Cmd+Shift+G = "Find Previous"). Capture phase below
                    // ensures we run before the editor's own key handlers.
                    e.preventDefault();
                    e.stopPropagation();
                    shortcut.handler();
                    break;
                }
            }
        };

        // Capture phase: the editor (Monaco) registers keydown handlers on its
        // own nodes; listening on capture lets app shortcuts win even while the
        // editor is focused.
        window.addEventListener("keydown", handleKeyDown, true);
        return () =>
            window.removeEventListener("keydown", handleKeyDown, true);
    }, [shortcuts, enabled]);
}

export function useEscapeKey(handler: () => void, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                handler();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handler, enabled]);
}
