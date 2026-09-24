import { describe, expect, it } from "vitest";

import { auditMocksObject } from "../../../src/server/mocks-edit/plan/audit-object";
import { openAudit } from "../../../src/server/mocks-edit/plan/audit-scope";
import { splitStatements } from "../../../src/server/mocks-edit/plan/audit-statements";
import type { PlannedInsertion } from "../../../src/server/mocks-edit/plan/types";

const HEADER = `import { defineMockServer } from "@noverax/courier-mock";\nimport c from "./courier.config";\n`;
const ENTRY = { key: "b", fields: [{ name: "source", value: "c.sources.b" }] };

function audit(
  oldText: string,
  newText: string,
  overrides: Partial<PlannedInsertion> = {},
): string | null {
  const plan: PlannedInsertion = {
    fileName: "courier.mocks.ts",
    oldText,
    literalKeys: ["a"],
    entries: [ENTRY],
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
  return typeof split === "string" ? split : auditMocksObject(scope, split);
}

const OLD = `${HEADER}export default { a: 1 };\n`;

describe("auditMocksObject", () => {
  it("accepts the planned entry after the old ones", () => {
    expect(
      audit(
        OLD,
        `${HEADER}export default { a: 1, b: defineMockServer({ source: c.sources.b }) };\n`,
      ),
    ).toBeNull();
  });

  it("rejects a plan that misread the old keys", () => {
    expect(
      audit(
        OLD,
        `${HEADER}export default { a: 1, b: defineMockServer({ source: c.sources.b }) };\n`,
        { literalKeys: ["z"] },
      ),
    ).toBe("the plan read the keys z, but the file declared a");
  });

  it("rejects an entry that is not a plain property", () => {
    expect(audit(OLD, `${HEADER}const b = 1;\nexport default { a: 1, b };\n`)).toBe(
      "the entry b is not a call with one argument",
    );
  });

  it("rejects an entry passing something other than an object literal", () => {
    expect(audit(OLD, `${HEADER}export default { a: 1, b: defineMockServer(c) };\n`)).toBe(
      "the entry b does not pass an object literal",
    );
  });

  it("rejects a shorthand or computed field", () => {
    expect(
      audit(
        OLD,
        `${HEADER}const source = 1;\nexport default { a: 1, b: defineMockServer({ source }) };\n`,
      ),
    ).toBe("the entry b has the fields source, not source: c.sources.b");
  });
});
