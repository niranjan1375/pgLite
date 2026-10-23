import { describe, expect, it } from "vitest";
import { extractVariables, selectionOverlapsVariableBlock } from "./workspace-utils";
import { pickReferencedVariables, resolveVariables } from "./variable-resolver";

describe("extractVariables", () => {
    it("reads the @var block and returns the SQL below it", () => {
        expect(extractVariables("@id = 5\n@env = 'x'\nSELECT @id")).toEqual({
            variables: { id: "5", env: "'x'" },
            sqlWithoutVars: "SELECT @id",
            variableBlockEndLine: 2,
        });
    });

    it("returns no variables when the first line is SQL", () => {
        expect(extractVariables("SELECT 1").variables).toEqual({});
    });

    it("throws on a malformed definition", () => {
        expect(() => extractVariables("@id 5\nSELECT 1")).toThrow(
            /Invalid variable definition on line 1/,
        );
    });

    it("detects selections that start inside the block", () => {
        expect(selectionOverlapsVariableBlock(1, 2)).toBe(true);
        expect(selectionOverlapsVariableBlock(2, 2)).toBe(false);
    });
});

describe("Context variable resolution", () => {
    const profile = {
        id: "p1",
        name: "Default",
        environments: { dev: { tenant: "t1", user: "u1" } },
    };

    it("lets local declarations win over Context values", () => {
        expect(
            resolveVariables({ profile, local: { user: "me" }, environment: "dev" }),
        ).toEqual({ tenant: "t1", user: "me" });
    });

    it("picks only referenced variables and reports missing ones", () => {
        expect(
            pickReferencedVariables("SELECT @tenant, @nope", {
                tenant: "t1",
                user: "u1",
            }),
        ).toEqual({ picked: { tenant: "t1" }, missing: ["nope"] });
    });
});
