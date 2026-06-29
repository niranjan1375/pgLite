export interface SavedQuery {
    id: string;
    name: string;
    query: string;
    folder: string;
    tags: string[];
    starred: boolean;
    environment: string;
    database: string;
    mode: "standard" | "workspace";
    createdAt: number;
    updatedAt: number;
}

export interface SavedQueryInput {
    name: string;
    query: string;
    folder?: string;
    tags?: string[];
    starred?: boolean;
    environment: string;
    database: string;
    mode?: "standard" | "workspace";
}

export const SAVED_QUERIES_STORAGE_KEY = "pgLite_savedQueries";

function normalizeSavedQuery(value: unknown): SavedQuery | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Partial<SavedQuery>;
    if (typeof record.id !== "string") {
        return null;
    }

    if (typeof record.name !== "string" || typeof record.query !== "string") {
        return null;
    }

    if (
        typeof record.environment !== "string" ||
        typeof record.database !== "string"
    ) {
        return null;
    }

    return {
        id: record.id,
        name: record.name,
        query: record.query,
        folder: typeof record.folder === "string" ? record.folder : "",
        tags: Array.isArray(record.tags)
            ? record.tags.filter(
                  (tag): tag is string => typeof tag === "string",
              )
            : [],
        starred: record.starred === true,
        environment: record.environment,
        database: record.database,
        mode: record.mode === "workspace" ? "workspace" : "standard",
        createdAt:
            typeof record.createdAt === "number"
                ? record.createdAt
                : Date.now(),
        updatedAt:
            typeof record.updatedAt === "number"
                ? record.updatedAt
                : Date.now(),
    };
}

export function sortSavedQueries(items: SavedQuery[]): SavedQuery[] {
    return [...items].sort((left, right) => {
        if (left.starred !== right.starred) {
            return left.starred ? -1 : 1;
        }

        return right.updatedAt - left.updatedAt;
    });
}

export function readSavedQueries(): SavedQuery[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(SAVED_QUERIES_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return sortSavedQueries(
            parsed
                .map(normalizeSavedQuery)
                .filter((item): item is SavedQuery => item !== null),
        );
    } catch {
        return [];
    }
}

export function writeSavedQueries(items: SavedQuery[]) {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(
        SAVED_QUERIES_STORAGE_KEY,
        JSON.stringify(sortSavedQueries(items)),
    );
}

export function createSavedQuery(input: SavedQueryInput): SavedQuery {
    const timestamp = Date.now();

    return {
        id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name.trim(),
        query: input.query,
        folder: input.folder?.trim() || "",
        tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean),
        starred: input.starred === true,
        environment: input.environment,
        database: input.database,
        mode: input.mode === "workspace" ? "workspace" : "standard",
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function toggleSavedQueryStar(
    items: SavedQuery[],
    id: string,
): SavedQuery[] {
    return sortSavedQueries(
        items.map((item) =>
            item.id === id
                ? {
                      ...item,
                      starred: !item.starred,
                      updatedAt: Date.now(),
                  }
                : item,
        ),
    );
}
