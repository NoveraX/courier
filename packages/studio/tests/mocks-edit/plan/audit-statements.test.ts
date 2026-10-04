import { describe, expect, it } from "vitest";

import { openAudit } from "../../../src/server/mocks-edit/plan/audit-scope";
import { auditStatements } from "../../../src/server/mocks-edit/plan/audit-statements";
import { splitStatements } from "../../../src/server/mocks-edit/plan/split-statements";
import type { PlannedInsertion } from "../../../src/server/mocks-edit/plan/types";

function planFor(oldText: string, overrides: Partial<PlannedInsertion> = {}): PlannedInsertion {
  return {
    fileName: "courier.mocks.ts",
    oldText,
    literalKeys: [],
    entries: [],
    serverCallee: "defineMockServer",
    configLocal: "courierConfig",
    configSpecifiers: ["./courier.config"],
    configForm: "default",
    addedStatements: [],
    extendedImport: null,
    ...overrides,
  };
}

function audit(
  oldText: string,
  newText: string,
  overrides: Partial<PlannedInsertion> = {},
): string | null {
  const plan = planFor(oldText, overrides);
  const scope = openAudit(newText, plan);
  if (typeof scope === "string") return scope;
  const split = splitStatements(scope.next, plan);
  return typeof split === "string" ? split : auditStatements(scope, split);
}

describe("auditStatements", () => {
  it("accepts unchanged statements and a claimed import", () => {
    expect(
      audit("const x = 1;\n", `import a from "a";\nconst x = 1;\n`, {
        addedStatements: [`import a from "a";`],
      }),
    ).toBeNull();
  });

  it("accepts an import that gains exactly the claimed names", () => {
    const oldText = `import { a } from "m";\n`;

    expect(
      audit(oldText, `import { a, b } from "m";\n`, { extendedImport: { start: 0, names: ["b"] } }),
    ).toBeNull();
    expect(
      audit(oldText, `import { a, type b } from "m";\n`, {
        extendedImport: { start: 0, names: ["b"] },
      }),
    ).toBe("the import of m did not gain exactly b");
    expect(
      audit(oldText, `import type { a, b } from "m";\n`, {
        extendedImport: { start: 0, names: ["b"] },
      }),
    ).toBe("the import of m did not gain exactly b");
  });

  it("accepts the appended default export only in a file that had none", () => {
    const appended = "export default {};";

    expect(
      audit("const x = 1;\n", `const x = 1;\n${appended}\n`, { addedStatements: [appended] }),
    ).toBeNull();
    expect(
      audit("export default 1;\n", `export default 1;\n${appended}\n`, {
        addedStatements: [appended],
      }),
    ).toBe(
      "before the edit, courier.mocks.ts does not export an object literal Studio can add to.",
    );
  });

  it("rejects a statement that moved", () => {
    expect(audit("const x = 1;\nconst y = 2;\n", "const y = 2;\nconst x = 1;\n")).toBe(
      "the statement const x = 1; changed",
    );
  });
});
