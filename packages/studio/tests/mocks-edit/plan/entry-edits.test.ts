import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import type { EntryEdits } from "../../../src/server/mocks-edit/plan/entry-edits";
import { planEntryEdits } from "../../../src/server/mocks-edit/plan/entry-edits";
import { locateMocksObject } from "../../../src/server/mocks-edit/plan/locate-mocks-object";
import type { ImportPlan } from "../../../src/server/mocks-edit/plan/plan-imports";
import { readMockImports } from "../../../src/server/mocks-edit/plan/read-mock-imports";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

const SEARCH: MockDeclaration = {
  key: "search",
  source: "search",
  port: null,
  seedCount: 20,
  autoStart: false,
};
const CTX = {
  serverCallee: "defineMockServer",
  configLocal: "c",
  style: DEFAULT_STYLE,
  guardMocksColon: false,
};
const NO_IMPORTS: ImportPlan = {
  serverCallee: "defineMockServer",
  mocksCallee: "defineMocks",
  configLocal: "c",
  configSpecifier: "./courier.config",
  edits: [],
  addedStatements: [],
  extendedImport: null,
};

function plan(text: string, imports: ImportPlan = NO_IMPORTS): EntryEdits {
  const parsed = parseSource("courier.mocks.ts", text);
  const located = locateMocksObject(parsed, readMockImports(parsed.program));
  return planEntryEdits(parsed, located, imports, [SEARCH], CTX);
}

describe("planEntryEdits", () => {
  it("inserts into the mocks object and adds no statement", () => {
    const text = "export default {\n  a: 1,\n};\n";

    expect(plan(text)).toEqual({
      edits: [
        {
          start: text.indexOf("}"),
          end: text.indexOf("}"),
          text: "  search: defineMockServer({ source: c.sources.search }),\n",
        },
      ],
      statements: [],
    });
  });

  it("appends a default export to a file without one", () => {
    const text = "const a = 1;\n";

    expect(plan(text)).toEqual({
      edits: [
        {
          start: text.length,
          end: text.length,
          text: "\nexport default defineMocks({\n  search: defineMockServer({ source: c.sources.search }),\n});\n",
        },
      ],
      statements: [
        "export default defineMocks({\n  search: defineMockServer({ source: c.sources.search }),\n});",
      ],
    });
  });

  it("puts a blank line before the export in a file that ends without a line break", () => {
    const text = "const a = 1;";

    expect(plan(text).edits).toEqual([
      {
        start: text.length,
        end: text.length,
        text: "\n\nexport default defineMocks({\n  search: defineMockServer({ source: c.sources.search }),\n});\n",
      },
    ]);
  });

  it("judges the blank line before the export against imports inserted at the end", () => {
    const text = "// mocks\n";
    const imports = {
      ...NO_IMPORTS,
      edits: [{ start: text.length, end: text.length, text: '\nimport c from "./c";\n' }],
    };

    expect(plan(text, imports).edits[0]?.text.startsWith("\nexport default defineMocks({")).toBe(
      true,
    );
  });
});
