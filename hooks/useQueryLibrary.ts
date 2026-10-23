import { useCallback, useEffect, useState } from "react";
import type { QueryHistoryItem } from "@/components/QueryHistory";
import {
    createSavedQuery,
    readSavedQueries,
    toggleSavedQueryStar,
    writeSavedQueries,
    type SavedQuery,
    type SavedQueryInput,
} from "@/lib/queryStorage";

const QUERY_HISTORY_STORAGE_KEY = "pgLite_queryHistory";
const MAX_QUERY_HISTORY_ITEMS = 100;

/** Query history, persisted to localStorage (newest first, capped). */
export function useQueryHistory() {
    const [items, setItems] = useState<QueryHistoryItem[]>([]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(QUERY_HISTORY_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount; reading storage during render breaks hydration
                setItems(parsed);
            }
        } catch (err) {
            console.error("Failed to load query history:", err);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(
                QUERY_HISTORY_STORAGE_KEY,
                JSON.stringify(items),
            );
        } catch (err) {
            console.error("Failed to save query history:", err);
        }
    }, [items]);

    const append = useCallback((item: QueryHistoryItem) => {
        setItems((prev) => [item, ...prev].slice(0, MAX_QUERY_HISTORY_ITEMS));
    }, []);

    const remove = useCallback((id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const clear = useCallback(() => setItems([]), []);

    return { items, append, remove, clear };
}

/** Saved queries, persisted to localStorage via lib/queryStorage. */
export function useSavedQueries() {
    const [items, setItems] = useState<SavedQuery[]>([]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount; reading storage during render breaks hydration
        setItems(readSavedQueries());
    }, []);

    useEffect(() => {
        writeSavedQueries(items);
    }, [items]);

    const save = useCallback((input: SavedQueryInput) => {
        const saved = createSavedQuery(input);
        setItems((prev) => [saved, ...prev]);
    }, []);

    const remove = useCallback((id: string) => {
        setItems((prev) => prev.filter((query) => query.id !== id));
    }, []);

    const toggleStar = useCallback((id: string) => {
        setItems((prev) => toggleSavedQueryStar(prev, id));
    }, []);

    return { items, save, remove, toggleStar };
}
