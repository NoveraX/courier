/**
 * The check a plan passes before it is returned: the edited text, read
 * back, says what the plan claims — fed forged plans and texts, the audit
 * rejects each one and logs why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auditInsertedCode } from "../../../src/server/mocks-edit/plan/audit-inserted-code";
import { draftMocksEdit } from "../../../src/server/mocks-edit/plan/draft-mocks-edit";
import { isPureInsertion } from "../../../src/server/mocks-edit/plan/is-pure-insertion";
import { readEditable } from "../../../src/server/mocks-edit/plan/read-editable";
import type {
  MocksDraft,
  PlanInput,
  PlannedInsertion,
} from "../../../src/server/mocks-edit/plan/types";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

const API: MockDeclaration = {
  key: "api",
  source: "api",
  port: null,
  seedCount: 20,
  autoStart: true,
};
const INPUT: PlanInput = {
  existing: null,
  createName: "courier.mocks.ts",
  configName: "courier.config.ts",
  configText: null,
  explicitExtensions: false,
  requests: [API],
};

const OLD = [
  `import { defineMocks } from "@noverax/courier-mock";`,
  "",
  "const seed = 20;",
  "",
  "export default defineMocks({",
  "  users: 1,",
  "});",
  "",
].join("\n");

function draftOf(text: string): MocksDraft {
  return draftMocksEdit(readEditable("courier.mocks.ts", text), INPUT);
}

function rejectionOf(newText: string, plan: PlannedInsertion): string {
  try {
    auditInsertedCode(newText, plan);
  } catch (err) {
    if (err instanceof MocksEditRefusal && err.code === "INTERNAL_PLAN_REJECTED")
      return err.message;
    throw err;
  }
  throw new Error("the audit accepted the plan");
}

describe("auditInsertedCode", () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the planner's own edit of a file", () => {
    const draft = draftOf(OLD);

    expect(() => auditInsertedCode(draft.text, draft.audit)).not.toThrow();
    expect(logged).toEqual([]);
  });

  it("accepts the planner's own created file", () => {
    const draft = draftOf("");

    expect(() => auditInsertedCode(draft.text, draft.audit)).not.toThrow();
    expect(logged).toEqual([]);
  });

  it("rejects an extra statement, and logs why", () => {
    const draft = draftOf(OLD);
    const forged = `${draft.text}const extra = 1;\n`;

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the edited file has 4 statements of its own where it had 3), so it changed nothing.",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(
      "The planned edit of courier.mocks.ts adding api failed its check: the edited file has 4 statements of its own where it had 3",
    );
  });

  it("rejects an extra statement even when the edits claim to insert it", () => {
    const draft = draftOf(OLD);
    const extra = { start: OLD.length, end: OLD.length, text: "const extra = 1;\n" };
    const edits = [...draft.edits.filter((edit) => edit.start < OLD.length), extra];
    const forged = `${draft.text}const extra = 1;\n`;

    expect(isPureInsertion(OLD, forged, edits)).toBe(true);
    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the edited file has 4 statements of its own where it had 3), so it changed nothing.",
    );
  });

  it("rejects a changed character in an existing statement", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("const seed = 20;", "const seed = 21;");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the statement const seed = 20; changed), so it changed nothing.",
    );
  });

  it("rejects a changed source in the import the plan extends", () => {
    const old = `import { defineMocks } from "@noverax/courier-mock";\nimport * as mock from "@noverax/courier-mock/managed";\n\nexport default mock.defineMocks({\n  users: 1,\n});\n`;
    const draft = draftOf(old);
    const forged = draft.text.replace(
      `from "@noverax/courier-mock";`,
      `from "@noverax/courier-mock/managed";`,
    );
    const plan = {
      ...draft.audit,
      serverCallee: "defineMockServer",
      extendedImport: { start: 0, names: ["defineMockServer"] },
    };

    expect(rejectionOf(forged, plan)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the import of @noverax/courier-mock did not gain exactly defineMockServer), so it changed nothing.",
    );
  });

  it("rejects a changed character in an existing entry", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("users: 1", "users: 2");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the existing entry at position 1 changed), so it changed nothing.",
    );
  });

  it("rejects a change outside the mocks object in the statement that holds it", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace(
      "export default defineMocks({",
      "export default defineMocks( {",
    );

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the statement holding the mocks object changed outside the object), so it changed nothing.",
    );
  });

  it("rejects an entry that calls another function", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("api: defineMockServer(", "api: defineMocks(");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the entry api calls defineMocks, not defineMockServer from the mock package), so it changed nothing.",
    );
  });

  it("rejects a callee the plan names but the file does not import from the mock package", () => {
    const old = `import { defineMocks } from "@noverax/courier-mock";\nimport { makeServer } from "./servers";\n\nexport default defineMocks({\n  users: 1,\n});\n`;
    const draft = draftOf(old);
    const forged = draft.text.replace("api: defineMockServer(", "api: makeServer(");
    const plan = { ...draft.audit, serverCallee: "makeServer" };

    expect(rejectionOf(forged, plan)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the entry api calls makeServer, not defineMockServer from the mock package), so it changed nothing.",
    );
  });

  it("rejects an entry whose fields differ from the plan's", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("autoStart: true", "autoStart: false");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the entry api has the fields source: courierConfig.sources.api, autoStart: false, not source: courierConfig.sources.api, autoStart: true), so it changed nothing.",
    );
  });

  it("rejects a planned import that is missing from the text", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace(`import courierConfig from "./courier.config";\n`, "");

    expect(rejectionOf(forged, draft.audit)).toBe(
      `Studio could not verify its edit of courier.mocks.ts (the planned statement import courierConfig from "./courier.config"; is not in the edited file), so it changed nothing.`,
    );
  });

  it("rejects an import that gains a name the plan did not claim", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace(
      "{ defineMocks, defineMockServer }",
      "{ defineMocks, defineMockServer, mock }",
    );

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the import of @noverax/courier-mock did not gain exactly defineMockServer), so it changed nothing.",
    );
  });

  it("rejects an imported name the file already declares", () => {
    const old = `import { defineMocks } from "@noverax/courier-mock";\nimport courierConfig from "./other";\n\nexport default defineMocks({\n  users: 1,\n});\n`;
    const draft = draftOf(old);
    const forged = draft.text.replaceAll("courierConfig2", "courierConfig");
    const plan: PlannedInsertion = {
      ...draft.audit,
      configLocal: "courierConfig",
      entries: [
        {
          key: "api",
          fields: [
            { name: "source", value: "courierConfig.sources.api" },
            { name: "autoStart", value: "true" },
          ],
        },
      ],
      addedStatements: [`import courierConfig from "./courier.config";`],
    };

    expect(rejectionOf(forged, plan)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the edit imports courierConfig, which the file already declares), so it changed nothing.",
    );
  });

  it("rejects a key the plan did not claim", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("  api: defineMockServer(", "  apx: defineMockServer(");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the mocks object declares users, apx, not users, api), so it changed nothing.",
    );
  });

  it("rejects a text that does not parse", () => {
    const draft = draftOf(OLD);

    expect(rejectionOf(`${draft.text}}`, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the edited file does not parse: Unexpected token (line 10)), so it changed nothing.",
    );
  });

  it("rejects a statement the edit adds that is not an import", () => {
    const draft = draftOf(OLD);
    const extra = "const extra = 1;";
    const forged = draft.text.replace(
      `import courierConfig from "./courier.config";`,
      `import courierConfig from "./courier.config";\n${extra}`,
    );
    const plan = { ...draft.audit, addedStatements: [...draft.audit.addedStatements, extra] };

    expect(rejectionOf(forged, plan)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (the edit adds a VariableDeclaration that is neither an import nor the mocks' default export), so it changed nothing.",
    );
  });

  it("rejects a mocks object the planner itself would refuse", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace("  users: 1,", "  ...shared,\n  users: 1,");

    expect(rejectionOf(forged, draft.audit)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (after the edit, courier.mocks.ts (line 7) spreads another object into the mocks, so Studio cannot see every key.), so it changed nothing.",
    );
  });

  it("rejects a config name that is not bound to the config", () => {
    const draft = draftOf(OLD);
    const forged = draft.text.replace(`from "./courier.config"`, `from "./courier.settings"`);
    const plan = {
      ...draft.audit,
      addedStatements: [`import courierConfig from "./courier.settings";`],
    };

    expect(rejectionOf(forged, plan)).toBe(
      "Studio could not verify its edit of courier.mocks.ts (courierConfig is not the config's default export in the edited file), so it changed nothing.",
    );
  });
});
