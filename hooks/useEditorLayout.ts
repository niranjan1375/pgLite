import { useCallback, useEffect, useRef, useState } from "react";

const MIN_EDITOR_HEIGHT = 150;
const MIN_RESULTS_HEIGHT = 200;
const FIXED_UI_HEIGHT = 150; // Tabs, status bar, etc.

/**
 * Editor/results split (drag to resize) and the explorer sidebar (⌘B),
 * both persisted to localStorage.
 */
export function useEditorLayout() {
    const [editorHeight, setEditorHeight] = useState(280);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const heightRef = useRef(editorHeight);
    useEffect(() => {
        heightRef.current = editorHeight;
    }, [editorHeight]);
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(
        null,
    );

    // Restore persisted layout prefs after mount (avoids SSR hydration mismatch)
    useEffect(() => {
        const savedHeight = localStorage.getItem("editorHeight");
        if (savedHeight) {
            const h = parseInt(savedHeight, 10);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount; reading storage during render breaks hydration
            if (!isNaN(h) && h > 0) setEditorHeight(h);
        }
        if (localStorage.getItem("sidebarCollapsed") === "true") {
            setSidebarCollapsed(true);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("sidebarCollapsed", sidebarCollapsed.toString());
    }, [sidebarCollapsed]);

    const toggleSidebar = useCallback(
        () => setSidebarCollapsed((prev) => !prev),
        [],
    );

    useEffect(() => {
        const handleShortcut = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                toggleSidebar();
            }
        };
        document.addEventListener("keydown", handleShortcut);
        return () => document.removeEventListener("keydown", handleShortcut);
    }, [toggleSidebar]);

    // Listeners are attached once; the drag reads its start point from a ref.
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const maxHeight =
                window.innerHeight - MIN_RESULTS_HEIGHT - FIXED_UI_HEIGHT;
            setEditorHeight(
                Math.min(
                    Math.max(
                        drag.startHeight + e.clientY - drag.startY,
                        MIN_EDITOR_HEIGHT,
                    ),
                    maxHeight,
                ),
            );
        };

        const handleEnd = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            localStorage.setItem("editorHeight", heightRef.current.toString());
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleEnd);
        return () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleEnd);
        };
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = { startY: e.clientY, startHeight: heightRef.current };
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
    }, []);

    return {
        editorHeight,
        sidebarCollapsed,
        toggleSidebar,
        handleResizeStart,
    };
}
