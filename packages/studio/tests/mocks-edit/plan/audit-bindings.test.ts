import { describe, expect, it } from "vitest";

import { auditBindings } from "../../../src/server/mocks-edit/plan/audit-bindings";
import { openAudit } from "../../../src/server/mocks-edit/plan/audit-scope";
import { splitStatements } from "../../../src/server/mocks-edit/plan/audit-statements";
import type { PlannedInsertion } from "../../../src/server/mocks-edit/plan/types";

function audit(
  oldText: string,
  newText: string,
  overrides: Partial<PlannedInsertion> = {},
): string | null {
  const plan: PlannedInsertion = {
    fileName: "courier.mocks.ts",
    oldText,
    literalKeys: [],
    entries: [],
    serverCallee: "defineMockServer",
    configLocal: "c",
    configSpecifiers: ["./courier.config"],
    addedStatements: [],
    extendedImport: null,
    ...overrides,
  };
  const scope = openAudit(newText, plan);
  if (typeof scope === "string") return scope;
  const split = splitStatements(scope.next, plan);
  return typeof split === "string" ? split : auditBindings(scope, split);
}

const CONFIG = `import c from "./courier.config";`;

describe("auditBindings", () => {
  it("accepts imports of free names and a config name bound to the config", () => {
    expect(
      audit("export default {};\n", `${CONFIG}\nexport default {};\n`, {
        addedStatements: [CONFIG],
      }),
    ).toBeNull();
  });

  it("rejects two added imports of one name", () => {
    const again = `import c from "./other";`;

    expect(
      audit("export default {};\n", `${CONFIG}\n${again}\nexport default {};\n`, {
        addedStatements: [CONFIG, again],
      }),
    ).toBe("the edit imports c, which the file already declares");
  });

  it("rejects an import of a name a var in a top-level block declares", () => {
    const oldText = "try {\n  var c = 1;\n} catch {}\nexport default {};\n";

    expect(
      audit(oldText, `${CONFIG}\n${oldText}`, {
        addedStatements: [CONFIG],
      }),
    ).toBe("the edit imports c, which the file already declares");
  });

  it("rejects a name the extended import gains that the file declares", () => {
    const oldText = `import { a } from "m";\nconst b = 1;\n${CONFIG}\n`;
    const newText = `import { a, b } from "m";\nconst b = 1;\n${CONFIG}\n`;

    expect(audit(oldText, newText, { extendedImport: { start: 0, names: ["b"] } })).toBe(
      "the edit imports b, which the file already declares",
    );
  });

  it("rejects a config name bound to something else", () => {
    expect(audit("const c = 1;\n", "const c = 1;\n")).toBe(
      "c is not the config's default export in the edited file",
    );
  });
});
