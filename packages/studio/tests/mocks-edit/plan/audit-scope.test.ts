import { describe, expect, it } from "vitest";

import { openAudit } from "../../../src/server/mocks-edit/plan/audit-scope";
import type { PlannedInsertion } from "../../../src/server/mocks-edit/plan/types";

function planFor(oldText: string): PlannedInsertion {
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
  };
}

describe("openAudit", () => {
  it("reads both texts and the mocks object in each", () => {
    const scope = openAudit(
      "export default { a: 1, b: 2 };\n",
      planFor("export default { a: 1 };\n"),
    );

    expect(typeof scope).toBe("object");
    if (typeof scope === "string") return;
    expect(scope.before.kind === "object" ? scope.before.keys : null).toEqual(["a"]);
    expect(scope.after.kind === "object" ? scope.after.keys : null).toEqual(["a", "b"]);
  });

  it("stops at an edited text that does not parse", () => {
    expect(openAudit("export default {", planFor("export default {};"))).toBe(
      "the edited file does not parse: Expected `}` but found `EOF` (line 1)",
    );
  });

  it("stops at an original text that does not parse", () => {
    expect(openAudit("export default {};", planFor("export default {"))).toBe(
      "the file before the edit does not parse: Expected `}` but found `EOF` (line 1)",
    );
  });

  it("stops at a mocks object the planner would refuse, before or after", () => {
    expect(openAudit("export default {};", planFor("export default { ...a };"))).toBe(
      "before the edit, courier.mocks.ts (line 1) spreads another object into the mocks, so Studio cannot see every key.",
    );
    expect(openAudit("export default { [a]: 1 };", planFor("export default {};"))).toBe(
      "after the edit, courier.mocks.ts (line 1) computes a mock's key, so Studio cannot see every key.",
    );
  });
});
