import { useCallback, useEffect, useState, type RefObject } from "react";
import type { QueryTabsRef } from "@/components/QueryTabs";

/**
 * Workspace SQL templates: the list (refreshed whenever a workspace tab is
 * active), open-into-a-new-tab, and save-from-the-active-tab.
 */
export function useTemplates({
    workspaceActive,
    queryTabsRef,
    defaultEnvironment,
    onError,
}: {
    workspaceActive: boolean;
    queryTabsRef: RefObject<QueryTabsRef | null>;
    defaultEnvironment: string;
    onError: (message: string) => void;
}) {
    const [templates, setTemplates] = useState<string[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    const fetchTemplates = useCallback(async () => {
        setLoadingTemplates(true);
        try {
            const res = await fetch("/api/templates", { cache: "no-store" });
            const data = await res.json();
            if (!data.error && Array.isArray(data.templates)) {
                setTemplates(data.templates);
            }
        } catch (err) {
            console.error("Failed to fetch templates:", err);
        } finally {
            setLoadingTemplates(false);
        }
    }, []);

    useEffect(() => {
        if (workspaceActive) fetchTemplates();
    }, [workspaceActive, fetchTemplates]);

    const openTemplate = useCallback(
        async (name: string) => {
            try {
                const res = await fetch(
                    `/api/templates/${encodeURIComponent(name)}`,
                    { cache: "no-store" },
                );
                const data = await res.json();
                if (!res.ok || data.error) {
                    onError(data.error || "Failed to open template.");
                    return;
                }

                const env =
                    queryTabsRef.current?.getActiveTab()?.environment ||
                    defaultEnvironment;
                queryTabsRef.current?.openWorkspaceTab({
                    name,
                    content: data.content,
                    environment: env,
                });
            } catch (err) {
                console.error("Failed to open template:", err);
                onError("Failed to open template.");
            }
        },
        [defaultEnvironment, onError, queryTabsRef],
    );

    const saveTemplate = useCallback(async () => {
        const currentTab = queryTabsRef.current?.getActiveTab();
        if (!currentTab || currentTab.mode !== "workspace") return;

        let templateName = currentTab.templateName;
        if (!templateName) {
            const inputName = window.prompt("Template name (.sql optional):");
            if (!inputName) return;
            templateName = inputName;
        }

        try {
            const res = await fetch("/api/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: templateName,
                    content: currentTab.query,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                onError(data.error || "Failed to save template.");
                return;
            }

            if (data.name) {
                queryTabsRef.current?.setActiveTabTemplateName(data.name);
            }
            await fetchTemplates();
        } catch (err) {
            console.error("Failed to save template:", err);
            onError("Failed to save template.");
        }
    }, [fetchTemplates, onError, queryTabsRef]);

    return { templates, loadingTemplates, openTemplate, saveTemplate };
}
