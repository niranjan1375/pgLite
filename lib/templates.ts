import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ParsedTemplate {
    variables: Record<string, string>;
    sql: string;
}

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIABLE_LINE_REGEX = /^@([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const VARIABLE_USAGE_REGEX = /(?<!\w)@([A-Za-z_][A-Za-z0-9_]*)\b/g;

const TEMPLATE_ROOT_DIR = path.join(process.cwd(), ".pgconsole", "templates");

export function parseTemplate(content: string): ParsedTemplate {
    const normalized = content.replace(/^\uFEFF/, "");
    const lines = normalized.split(/\r?\n/);
    console.log("🚀 ~ lines:", lines);

    if (lines.length === 0 || !lines[0].startsWith("@")) {
        throw new Error(
            "Template must begin with a variable block. First line must start with '@'.",
        );
    }

    const variables: Record<string, string> = {};
    let sqlStartIndex = -1;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (sqlStartIndex === -1) {
            if (!line.startsWith("@")) {
                sqlStartIndex = index;
                continue;
            }

            const match = line.match(VARIABLE_LINE_REGEX);
            if (!match) {
                throw new Error(
                    `Invalid variable definition on line ${index + 1}. Expected format: @variableName = value`,
                );
            }

            const variableName = match[1];
            const value = match[2] ?? "";

            if (!VARIABLE_NAME_REGEX.test(variableName)) {
                throw new Error(
                    `Invalid variable name '${variableName}' on line ${index + 1}.`,
                );
            }

            if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
                throw new Error(
                    `Duplicate variable '@${variableName}' on line ${index + 1}.`,
                );
            }

            variables[variableName] = value;
            continue;
        }

        if (line.startsWith("@")) {
            throw new Error(
                `Variable definitions are only allowed at the top of the template (line ${index + 1}).`,
            );
        }
    }

    if (Object.keys(variables).length === 0) {
        throw new Error("Template must define at least one variable.");
    }

    const sql = (
        sqlStartIndex === -1 ? "" : lines.slice(sqlStartIndex).join("\n")
    ).trim();

    return {
        variables,
        sql,
    };
}

export function validateVariables(
    variables: Record<string, string>,
    sql: string,
): void {
    if (!variables || Object.keys(variables).length === 0) {
        throw new Error(
            "No variables found. Template must define at least one variable.",
        );
    }

    for (const [name, value] of Object.entries(variables)) {
        if (!VARIABLE_NAME_REGEX.test(name)) {
            throw new Error(`Invalid variable name '@${name}'.`);
        }

        if (value.trim().length === 0) {
            throw new Error(
                `Variable '@${name}' must have a value before execution.`,
            );
        }
    }

    const usedVariables = new Set<string>();
    for (const match of sql.matchAll(VARIABLE_USAGE_REGEX)) {
        usedVariables.add(match[1]);
    }

    const undefinedVariables = [...usedVariables].filter(
        (name) => !Object.prototype.hasOwnProperty.call(variables, name),
    );

    if (undefinedVariables.length > 0) {
        throw new Error(
            `SQL references undefined variables: ${undefinedVariables
                .map((name) => `@${name}`)
                .join(", ")}`,
        );
    }
}

export function applyVariables(
    sql: string,
    variables: Record<string, string>,
): string {
    validateVariables(variables, sql);

    return sql.replace(
        VARIABLE_USAGE_REGEX,
        (fullMatch, variableName: string) => {
            const value = variables[variableName];
            return value !== undefined ? formatVariableValue(value) : fullMatch;
        },
    );
}

function formatVariableValue(value: string): string {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return "''";
    }

    const upper = trimmed.toUpperCase();
    if (upper === "NULL" || upper === "TRUE" || upper === "FALSE") {
        return upper;
    }

    const isSingleQuotedLiteral = /^'(?:[^']|'')*'$/.test(trimmed);
    if (isSingleQuotedLiteral) {
        return trimmed;
    }

    return `'${trimmed.replace(/'/g, "''")}'`;
}

export async function listTemplates(): Promise<string[]> {
    try {
        const entries = await readdir(TEMPLATE_ROOT_DIR, {
            withFileTypes: true,
        });

        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

export async function readTemplate(name: string): Promise<string> {
    const normalizedName = normalizeTemplateName(name);

    const filePath = resolveTemplatePath(normalizedName);

    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
            throw new Error(`Template '${normalizedName}' not found.`);
        }
        throw error;
    }
}

export async function writeTemplate(
    name: string,
    content: string,
): Promise<string> {
    const normalizedName = normalizeTemplateName(name);
    const filePath = resolveTemplatePath(normalizedName);

    await mkdir(TEMPLATE_ROOT_DIR, { recursive: true });
    await writeFile(filePath, content, "utf8");

    return normalizedName;
}

export function normalizeTemplateName(name: string): string {
    if (!name || name.trim().length === 0) {
        throw new Error("Template name is required.");
    }

    if (name.includes("/") || name.includes("\\")) {
        throw new Error("Template name must not include path separators.");
    }

    const normalizedName = name.endsWith(".sql") ? name : `${name}.sql`;

    if (!/^[A-Za-z0-9._-]+\.sql$/.test(normalizedName)) {
        throw new Error(
            "Invalid template name. Use letters, numbers, dot, underscore, hyphen, and .sql extension.",
        );
    }

    return normalizedName;
}

function resolveTemplatePath(normalizedName: string): string {
    const filePath = path.resolve(TEMPLATE_ROOT_DIR, normalizedName);
    if (!filePath.startsWith(path.resolve(TEMPLATE_ROOT_DIR) + path.sep)) {
        throw new Error("Invalid template path.");
    }
    return filePath;
}
