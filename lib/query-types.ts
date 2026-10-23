// Shapes shared by the main page and its hooks (client side).

export type QueryMode = "standard" | "workspace";

export interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    totalRows?: number; // Full row count before truncation (present when truncated)
    fields: string[];
    truncated?: boolean;
    routedDatabase?: string; // Present when workspace mode auto-routes to a database
}

export interface QueryError {
    error: string;
    truncated?: boolean;
    rowCount?: number;
}

export interface ExplainNode {
    "Node Type": string;
    Plans?: ExplainNode[];
}

export interface ExplainResult {
    isExplain: true;
    explain: {
        Plan: ExplainNode;
        "Planning Time"?: number;
        "Execution Time"?: number;
    };
    executionTime?: number;
    routedDatabase?: string;
}

export type QueryResponse = QueryResult | QueryError | ExplainResult;

export function isQueryError(data: QueryResponse): data is QueryError {
    return "error" in data;
}

export function isExplainResult(data: QueryResponse): data is ExplainResult {
    return "isExplain" in data && data.isExplain;
}

export interface Table {
    schema: string;
    name: string;
    database?: string;
    primaryKeys?: string[];
}

export interface Column {
    name: string;
    type: string;
    nullable: string;
}

export interface WorkspaceSchema {
    database: string;
    schemas: {
        schema: string;
        tables: {
            name: string;
            primaryKeys?: string[];
            columns: Column[];
        }[];
    }[];
}

export interface TableViewerState {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    sortColumn: string | null;
    sortDirection: "asc" | "desc";
    searchQuery: string;
}

export type TableViewUpdates = Partial<
    Pick<
        TableViewerState,
        "page" | "pageSize" | "sortColumn" | "sortDirection" | "searchQuery"
    >
>;

/** A table the viewer is showing; `database` is always resolved. */
export interface ViewedTable {
    name: string;
    schema: string;
    database: string;
    primaryKeys?: string[];
}

export interface QueryRequest {
    query: string;
    environment: string;
    database: string;
    readOnly: boolean;
    mode: QueryMode;
    variables?: Record<string, string>;
    explain?: boolean;
}
