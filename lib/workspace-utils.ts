/**
 * Frontend utility for workspace mode variable extraction and validation.
 *
 * This module handles:
 * - Extracting variable blocks from editor content
 * - Validating variable syntax and values
 * - Determining execution targets (selection or statement at cursor)
 */

export interface ExtractedVariables {
    variables: Record<string, string>;
    /** SQL content without the variable block */
    sqlWithoutVars: string;
    /** Line number where variable block ends (0-indexed) */
    variableBlockEndLine: number;
}

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIABLE_LINE_REGEX = /^@([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const VARIABLE_USAGE_REGEX = /(?<!\w)@([A-Za-z_][A-Za-z0-9_]*)\b/g;

/**
 * Extract variables from the top of editor content.
 *
 * @param content Full editor content
 * @returns Extracted variables and SQL without variable block
 */
export function extractVariables(content: string): ExtractedVariables {
    const normalized = content.replace(/^\uFEFF/, ""); // Remove BOM
    const lines = normalized.split(/\r?\n/);

    const variables: Record<string, string> = {};
    let variableBlockEndLine = 0;

    // If content doesn't start with @, there are no variables
    if (lines.length === 0 || !lines[0].trim().startsWith("@")) {
        return {
            variables: {},
            sqlWithoutVars: content.trim(),
            variableBlockEndLine: 0,
        };
    }

    // Parse variable block from top
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const trimmedLine = line.trim();

        // Variable block ends at first non-@ line
        if (!trimmedLine.startsWith("@")) {
            variableBlockEndLine = index;
            break;
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

        variables[variableName] = value.trim();
    }

    // If all lines are variables, SQL is empty
    if (variableBlockEndLine === 0 && Object.keys(variables).length > 0) {
        variableBlockEndLine = lines.length;
    }

    const sqlWithoutVars = lines.slice(variableBlockEndLine).join("\n").trim();

    return {
        variables,
        sqlWithoutVars,
        variableBlockEndLine,
    };
}

/**
 * Validate that all variables have non-empty values.
 *
 * @param variables Variables object
 * @throws Error if any variable has empty value
 */
export function validateVariableValues(
    variables: Record<string, string>,
): void {
    for (const [name, value] of Object.entries(variables)) {
        if (value.trim().length === 0) {
            throw new Error(
                `Variable '@${name}' must have a value before execution.`,
            );
        }
    }
}

/**
 * Check if a selection range overlaps with the variable block.
 *
 * @param selectionStartLine 0-indexed line number where selection starts
 * @param variableBlockEndLine 0-indexed line number where variable block ends
 * @returns true if selection overlaps variable block
 */
export function selectionOverlapsVariableBlock(
    selectionStartLine: number,
    variableBlockEndLine: number,
): boolean {
    return selectionStartLine < variableBlockEndLine;
}

/**
 * Validate that all variables referenced in SQL are defined.
 *
 * @param sql SQL content
 * @param variables Defined variables
 * @throws Error if SQL references undefined variables
 */
export function validateVariableReferences(
    sql: string,
    variables: Record<string, string>,
): void {
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
