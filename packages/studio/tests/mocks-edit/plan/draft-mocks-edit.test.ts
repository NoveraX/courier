import { describe, expect, it } from "vitest";

import { draftMocksEdit } from "../../../src/server/mocks-edit/plan/draft-mocks-edit";
import { readEditable } from "../../../src/server/mocks-edit/plan/read-editable";
import type { MocksDraft, PlanInput } from "../../../src/server/mocks-edit/plan/types";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

const SEARCH: MockDeclaration = {
  key: "search",
  source: "search",
  port: 7000,
  seedCount: 20,
  autoStart: false,
};
const BILLING: MockDeclaration = {
  key: "billing",
  source: "billing-api",
  port: 4010,
  seedCount: 5,
  autoStart: false,
};

function draftOf(text: string, overrides: Partial<PlanInput> = {}): MocksDraft {
  const input: PlanInput = {
    existing: null,
    createName: "courier.mocks.ts",
    configName: "courier.config.ts",
    configText: null,
    explicitExtensions: false,
    requests: [SEARCH],
    ...overrides,
  };
  return draftMocksEdit(readEditable("courier.mocks.ts", text), input);
}

describe("draftMocksEdit", () => {
  it("claims what it adds, for the audit", () => {
    const text = `import { defineMocks } from "@noverax/courier-mock";\n\nexport default defineMocks({\n  users: 1,\n});\n`;

    const draft = draftOf(text);

    expect(draft.literalKeys).toEqual(["users"]);
    expect(draft.audit).toEqual({
      fileName: "courier.mocks.ts",
      oldText: text,
      literalKeys: ["users"],
      entries: [
        {
          key: "search",
          fields: [
            { name: "source", value: "courierConfig.sources.search" },
            { name: "port", value: "7000" },
          ],
        },
      ],
      serverCallee: "defineMockServer",
      configLocal: "courierConfig",
      configSpecifiers: ["./courier.config", "./courier.config.ts", "./courier.config.js"],
      configForm: "default",
      addedStatements: [`import courierConfig from "./courier.config";`],
      extendedImport: { start: 0, names: ["defineMockServer"] },
    });
  });

  it("returns its insertions ascending, one per offset", () => {
    const text = "export default {\n  users: 1\n};\n";

    const draft = draftOf(text);

    expect(draft.edits.map((edit) => edit.start)).toEqual([
      0,
      text.indexOf("1") + 1,
      text.indexOf("}"),
    ]);
  });

  it("writes a file with no text as one insertion at offset 0, in the config's style", () => {
    const configText =
      "import a from 'a'\r\nexport default {\r\n    sources: {\r\n        a\r\n    }\r\n}\r\n";

    const draft = draftOf("", { configName: "courier.config.js", configText, requests: [BILLING] });

    const expected = [
      "import { defineMocks, defineMockServer } from '@noverax/courier-mock'",
      "import courierConfig from './courier.config.js'",
      "",
      "export default defineMocks({",
      "    billing: defineMockServer({",
      "        source: courierConfig.sources['billing-api'],",
      "        port: 4010,",
      "        seed: { count: 5 }",
      "    })",
      "})",
      "",
    ].join("\r\n");
    expect(draft.text).toBe(expected);
    expect(draft.edits).toEqual([{ start: 0, end: 0, text: expected }]);
    expect(draft.audit.addedStatements).toEqual([
      "import { defineMocks, defineMockServer } from '@noverax/courier-mock'",
      "import courierConfig from './courier.config.js'",
      expected.slice(expected.indexOf("export"), expected.lastIndexOf("})") + 2),
    ]);
  });

  it("writes a file with no text in Biome's defaults when the config was not read", () => {
    expect(draftOf("", { requests: [BILLING] }).text).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "export default defineMocks({",
        "  billing: defineMockServer({",
        `    source: courierConfig.sources["billing-api"],`,
        "    port: 4010,",
        "    seed: { count: 5 },",
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
  });

  /* oxc recovers no statements from a text that stops mid-object, so what
     only statements show falls back to the defaults. */
  it("reads line endings and indentation from a config that does not parse", () => {
    const configText = "import a from 'a'\r\nexport default {\r\n    sources: {\r\n";

    const draft = draftOf("", { configName: "courier.config.js", configText, requests: [BILLING] });

    expect(draft.text).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config.js";`,
        "",
        "export default defineMocks({",
        "    billing: defineMockServer({",
        `        source: courierConfig.sources["billing-api"],`,
        "        port: 4010,",
        "        seed: { count: 5 },",
        "    }),",
        "});",
        "",
      ].join("\r\n"),
    );
  });

  it("writes a file with text in its own style, not the config's", () => {
    const configText = "import a from 'a'\nexport default {\n\tsources: {},\n}\n";

    const requests = [{ ...SEARCH, port: null }];

    const draft = draftOf("export default {\n  users: 1,\n};\n", { configText, requests });

    expect(draft.text).toBe(
      [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "export default {",
        "  users: 1,",
        "  search: defineMockServer({ source: courierConfig.sources.search }),",
        "};",
        "",
      ].join("\n"),
    );
  });

  it("takes the trailing-comma style of the mocks object it adds to", () => {
    const text = "const a = [\n  1,\n];\nexport default {\n  users: 1\n};\n";

    const draft = draftOf(text, { requests: [BILLING] });

    expect(draft.text).toContain("    seed: { count: 5 }\n  })\n};\n");
  });

  it("keeps a snippet's text from reading mocks: when asked to", () => {
    const input: PlanInput = {
      existing: null,
      createName: "courier.mocks.ts",
      configName: "courier.config.ts",
      configText: null,
      explicitExtensions: false,
      requests: [{ ...SEARCH, key: "mocks" }],
    };

    const draft = draftMocksEdit(readEditable("courier.mocks.ts", ""), input, true);

    expect(draft.text).toContain(`  "mocks": defineMockServer(`);
    expect(draft.text.includes("mocks:")).toBe(false);
  });
});
