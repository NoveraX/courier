import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
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

describe("splitStatements", () => {
  it("tells the claimed statements from the file's own, in order", () => {
    const next = parseSource("x.ts", `import a from "a";\nconst x = 1;\nimport b from "b";\n`);

    const split = splitStatements(
      next,
      planFor("", { addedStatements: [`import a from "a";`, `import b from "b";`] }),
    );

    expect(typeof split === "string" ? split : [split.added.length, split.kept.length]).toEqual([
      2, 1,
    ]);
  });

  it("names a claimed statement the text lacks", () => {
    const next = parseSource("x.ts", "const x = 1;\n");

    expect(splitStatements(next, planFor("", { addedStatements: [`import a from "a";`] }))).toBe(
      `the planned statement import a from "a"; is not in the edited file`,
    );
  });
});
