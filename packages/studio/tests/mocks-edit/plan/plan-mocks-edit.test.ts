/**
 * The planner of edits to courier.mocks.ts: for each shape a mocks file
 * takes, the exact text it writes, as pure insertions that parse; and the
 * refusal, with its code, for each file it must leave to the user.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { applyEdits } from "../../../src/server/mocks-edit/plan/apply-edits";
import { planMocksEdit } from "../../../src/server/mocks-edit/plan/plan-mocks-edit";
import type { PlanInput } from "../../../src/server/mocks-edit/plan/types";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import type { MockDeclaration, RefusalCode } from "../../../src/server/mocks-edit/types";

function request(key: string, overrides: Partial<MockDeclaration> = {}): MockDeclaration {
  return { key, source: key, port: null, seedCount: 20, autoStart: false, ...overrides };
}

const API = request("api", { autoStart: true });
const BILLING = request("billing", { port: 4010, seedCount: 50 });
const SEARCH = request("search");

function editOf(
  text: string,
  requests: readonly MockDeclaration[] = [API],
  configName = "courier.config.ts",
): PlanInput {
  return {
    existing: { name: "courier.mocks.ts", text },
    createName: "courier.mocks.ts",
    configName,
    configText: null,
    explicitExtensions: false,
    requests,
  };
}

function parseErrors(text: string, fileName = "courier.mocks.ts"): string[] {
  return parseSync(fileName, text).errors.map((error) => error.message);
}

function refusalOf(input: PlanInput): { code: RefusalCode; message: string } {
  try {
    planMocksEdit(input);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error("planMocksEdit did not refuse");
}

const IMPORTS = [
  `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
  `import courierConfig from "./courier.config";`,
  "",
].join("\n");
const USERS = "users: defineMockServer({ source: courierConfig.sources.users })";
const API_ENTRY = "api: defineMockServer({ source: courierConfig.sources.api, autoStart: true })";

interface Row {
  name: string;
  before: string;
  after: string;
  requests?: readonly MockDeclaration[];
  literalKeys: string[];
}

const ROWS: Row[] = [
  {
    name: "appends to the object passed to defineMocks",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "calls defineMockServer under the alias it is imported as",
    before: [
      `import { defineMocks as mocks, defineMockServer as server } from "@noverax/courier-mock/managed";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default mocks({",
      "  users: server({ source: courierConfig.sources.users }),",
      "});",
      "",
    ].join("\n"),
    after: [
      `import { defineMocks as mocks, defineMockServer as server } from "@noverax/courier-mock/managed";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default mocks({",
      "  users: server({ source: courierConfig.sources.users }),",
      "  api: server({ source: courierConfig.sources.api, autoStart: true }),",
      "});",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "calls through a namespace import, one field per line past 80 columns",
    before: [
      `import * as courier from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default courier.defineMocks({",
      "  users: courier.defineMockServer({ source: courierConfig.sources.users }),",
      "});",
      "",
    ].join("\n"),
    after: [
      `import * as courier from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default courier.defineMocks({",
      "  users: courier.defineMockServer({ source: courierConfig.sources.users }),",
      "  api: courier.defineMockServer({",
      "    source: courierConfig.sources.api,",
      "    autoStart: true,",
      "  }),",
      "});",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "appends to a plain exported object",
    before: `import { defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default {\n  ${USERS},\n};\n`,
    after: `import { defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default {\n  ${USERS},\n  ${API_ENTRY},\n};\n`,
    literalKeys: ["users"],
  },
  {
    name: "looks through satisfies around the object",
    before: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default {\n  ${USERS},\n} satisfies Mocks;\n`,
    after: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default {\n  ${USERS},\n  ${API_ENTRY},\n} satisfies Mocks;\n`,
    literalKeys: ["users"],
  },
  {
    name: "looks through parentheses and as around the call",
    before: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default (defineMocks({\n  ${USERS},\n}) as Mocks);\n`,
    after: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default (defineMocks({\n  ${USERS},\n  ${API_ENTRY},\n}) as Mocks);\n`,
    literalKeys: ["users"],
  },
  {
    name: "looks through satisfies and a non-null assertion around the argument",
    before: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default defineMocks(({\n  ${USERS},\n} satisfies Mocks)!);\n`,
    after: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default defineMocks(({\n  ${USERS},\n  ${API_ENTRY},\n} satisfies Mocks)!);\n`,
    literalKeys: ["users"],
  },
  {
    name: "looks through an angle-bracket assertion",
    before: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default <Mocks>{\n  ${USERS},\n};\n`,
    after: `import type { Mocks } from "./mocks-type";\n${IMPORTS}\nexport default <Mocks>{\n  ${USERS},\n  ${API_ENTRY},\n};\n`,
    literalKeys: ["users"],
  },
  {
    name: "appends to the object held by the const the file exports",
    before: `${IMPORTS}\nconst mocks = defineMocks({\n  ${USERS},\n});\n\nexport default mocks;\n`,
    after: `${IMPORTS}\nconst mocks = defineMocks({\n  ${USERS},\n  ${API_ENTRY},\n});\n\nexport default mocks;\n`,
    literalKeys: ["users"],
  },
  {
    name: "appends to an exported const the file also exports as default",
    before: `${IMPORTS}\nexport const mocks = {\n  ${USERS},\n};\n\nexport default mocks;\n`,
    after: `${IMPORTS}\nexport const mocks = {\n  ${USERS},\n  ${API_ENTRY},\n};\n\nexport default mocks;\n`,
    literalKeys: ["users"],
  },
  {
    name: "appends to the const named in export { x as default }",
    before: `${IMPORTS}\nconst mocks = {\n  ${USERS},\n};\n\nexport { mocks as default };\n`,
    after: `${IMPORTS}\nconst mocks = {\n  ${USERS},\n  ${API_ENTRY},\n};\n\nexport { mocks as default };\n`,
    literalKeys: ["users"],
  },
  {
    name: "opens an empty {} into a block",
    before: `${IMPORTS}\nexport default defineMocks({});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`,
    literalKeys: [],
  },
  {
    name: "opens { } into a block, leaving its space as trailing space",
    before: `${IMPORTS}\nexport default defineMocks({ });\n`,
    after: `${IMPORTS}\nexport default defineMocks({ \n  ${API_ENTRY},\n});\n`,
    literalKeys: [],
  },
  {
    name: "fills an empty object whose brace is on its own line",
    before: `${IMPORTS}\nexport default defineMocks({\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`,
    literalKeys: [],
  },
  {
    name: "writes entries after the comments of an otherwise empty block",
    before: `${IMPORTS}\nexport default defineMocks({\n  // Studio adds mocks here.\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  // Studio adds mocks here.\n  ${API_ENTRY},\n});\n`,
    literalKeys: [],
  },
  {
    name: "writes an entry after the comment of an otherwise empty inline object",
    before: `${IMPORTS}\nexport default defineMocks({ /* none yet */ });\n`,
    after: `${IMPORTS}\nexport default defineMocks({ /* none yet */ ${API_ENTRY} });\n`,
    literalKeys: [],
  },
  {
    name: "adds the missing comma and follows an object without trailing commas",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS}\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n  ${API_ENTRY}\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "puts the missing comma before a comment on the last property's line",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS} // the main API\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${USERS}, // the main API\n  ${API_ENTRY}\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "writes after a comment that follows the trailing comma",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS}, // the main API\n});\n`,
    after: `${IMPORTS}\nexport default defineMocks({\n  ${USERS}, // the main API\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "appends inline after the last property of a one-line object",
    before: `${IMPORTS}\nexport default defineMocks({ users: defineMockServer({ source: courierConfig.sources.users }) });\n`,
    after: `${IMPORTS}\nexport default defineMocks({ users: defineMockServer({ source: courierConfig.sources.users }), ${API_ENTRY} });\n`,
    literalKeys: ["users"],
  },
  {
    name: "appends inline after the trailing comma of a one-line object",
    before: `${IMPORTS}\nexport default defineMocks({ users: defineMockServer({ source: courierConfig.sources.users }), });\n`,
    after: `${IMPORTS}\nexport default defineMocks({ users: defineMockServer({ source: courierConfig.sources.users }), ${API_ENTRY}, });\n`,
    literalKeys: ["users"],
  },
  {
    name: "keeps a CRLF file's line endings",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n});\n`.replaceAll("\n", "\r\n"),
    after:
      `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n  ${API_ENTRY},\n});\n`.replaceAll(
        "\n",
        "\r\n",
      ),
    literalKeys: ["users"],
  },
  {
    name: "writes imports after the BOM of a file without imports",
    before: "\uFEFFexport default {\n  users: 1,\n};\n",
    after: [
      `\uFEFFimport { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default {",
      "  users: 1,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "keeps the BOM of a file with imports",
    before: `\uFEFF${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n});\n`,
    after: `\uFEFF${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "indents with the file's tabs, a tab counting two columns",
    before: `${IMPORTS}\nexport default defineMocks({\n\t${USERS},\n});\n`,
    after: [
      IMPORTS,
      "export default defineMocks({",
      `\t${USERS},`,
      `\t${API_ENTRY},`,
      "\tbilling: defineMockServer({",
      "\t\tsource: courierConfig.sources.billing,",
      "\t\tport: 4010,",
      "\t\tseed: { count: 50 },",
      "\t}),",
      "});",
      "",
    ].join("\n"),
    requests: [API, BILLING],
    literalKeys: ["users"],
  },
  {
    name: "writes new imports and source keys in the file's single quotes",
    before: `import { defineMocks, defineMockServer } from '@noverax/courier-mock';\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: [
      `import { defineMocks, defineMockServer } from '@noverax/courier-mock';`,
      `import courierConfig from './courier.config';`,
      "",
      "export default defineMocks({",
      "  users: 1,",
      "  search: defineMockServer({ source: courierConfig.sources['search-api'] }),",
      "});",
      "",
    ].join("\n"),
    requests: [request("search", { source: "search-api" })],
    literalKeys: ["users"],
  },
  {
    name: "leaves semicolons out in a file that has none",
    before: `import { defineMocks } from "@noverax/courier-mock"\n\nexport default defineMocks({\n  users: 1,\n})\n`,
    after: [
      `import { defineMocks, defineMockServer } from "@noverax/courier-mock"`,
      `import courierConfig from "./courier.config"`,
      "",
      "export default defineMocks({",
      "  users: 1,",
      `  ${API_ENTRY},`,
      "})",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "counts offsets in UTF-16 past non-ASCII text",
    before: `// Моки для разработки 🚀\n${IMPORTS}\nexport default defineMocks({\n  ${USERS}, // «пользователи»\n});\n`,
    after: `// Моки для разработки 🚀\n${IMPORTS}\nexport default defineMocks({\n  ${USERS}, // «пользователи»\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "adds several mocks in one edit",
    before: `${IMPORTS}\nexport default defineMocks({\n  ${USERS},\n});\n`,
    after: [
      IMPORTS,
      "export default defineMocks({",
      `  ${USERS},`,
      `  ${API_ENTRY},`,
      "  billing: defineMockServer({",
      "    source: courierConfig.sources.billing,",
      "    port: 4010,",
      "    seed: { count: 50 },",
      "  }),",
      "  search: defineMockServer({ source: courierConfig.sources.search }),",
      "});",
      "",
    ].join("\n"),
    requests: [API, BILLING, SEARCH],
    literalKeys: ["users"],
  },
  {
    name: "reuses a value import of the config under its own name",
    before: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport config from "./courier.config.js";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport config from "./courier.config.js";\n\nexport default defineMocks({\n  users: 1,\n  api: defineMockServer({ source: config.sources.api, autoStart: true }),\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "reuses import { default as x } of the config",
    before: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport { default as cfg } from "./courier.config.ts";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport { default as cfg } from "./courier.config.ts";\n\nexport default defineMocks({\n  users: 1,\n  api: defineMockServer({ source: cfg.sources.api, autoStart: true }),\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "imports the config anew beside a type-only import holding courierConfig",
    before: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport type courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: [
      `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
      `import type courierConfig from "./courier.config";`,
      `import courierConfig2 from "./courier.config";`,
      "",
      "export default defineMocks({",
      "  users: 1,",
      "  api: defineMockServer({",
      "    source: courierConfig2.sources.api,",
      "    autoStart: true,",
      "  }),",
      "});",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "adds defineMockServer into the braces of the package's named import",
    before: `import { defineMocks } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "adds defineMockServer on a line of its own in a multi-line import",
    before: `import {\n  defineMocks,\n} from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: `import {\n  defineMocks,\n  defineMockServer,\n} from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "writes a new import line for defineMockServer when the managed entry is imported",
    before: `import { defineMocks } from "@noverax/courier-mock/managed";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1,\n});\n`,
    after: `import { defineMocks } from "@noverax/courier-mock/managed";\nimport courierConfig from "./courier.config";\nimport { defineMockServer } from "@noverax/courier-mock";\n\nexport default defineMocks({\n  users: 1,\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "starts the new import on a line of its own when code follows the last import on its line",
    before: `import { defineMocks, defineMockServer } from "@noverax/courier-mock"; export default defineMocks({\n  users: 1,\n});\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config"; export default defineMocks({\n  users: 1,\n  ${API_ENTRY},\n});\n`,
    literalKeys: ["users"],
  },
  {
    name: "starts the new import at the last import's end when a comment running past its line follows",
    before: `import { defineMocks } from "@noverax/courier-mock" /* a\n b */ export default defineMocks({\n})\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock"\nimport courierConfig from "./courier.config"; /* a\n b */ export default defineMocks({\n  ${API_ENTRY},\n})\n`,
    literalKeys: [],
  },
  {
    name: "writes a lone-CR file's new lines with CR, the entries on lines of their own",
    before: `import { defineMocks } from "@noverax/courier-mock"\rexport default defineMocks({\r  old: undefined,\r})\r`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock"\rimport courierConfig from "./courier.config"\rexport default defineMocks({\r  old: undefined,\r  ${API_ENTRY},\r})\r`,
    literalKeys: ["old"],
  },
  {
    name: "writes the new import after a U+2028 ending the last import's line",
    before: `import { defineMocks } from "@noverax/courier-mock"\u2028export default defineMocks({})\n`,
    after: `import { defineMocks, defineMockServer } from "@noverax/courier-mock"\u2028import courierConfig from "./courier.config"\nexport default defineMocks({\n  ${API_ENTRY},\n})\n`,
    literalKeys: [],
  },
  {
    name: "writes imports above the comment that governs a file's first statement",
    before: `// @ts-expect-error -- the helper is untyped\nconst helper = require("./helper");\n\nexport default {\n  users: helper,\n};\n`,
    after: [
      `import { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "// @ts-expect-error -- the helper is untyped",
      `const helper = require("./helper");`,
      "",
      "export default {",
      "  users: helper,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "writes imports below a triple-slash directive, which TypeScript reads only above the first statement",
    before: `/// <reference types="node" />\nconst port = Number(process.env.PORT);\nexport default {\n  users: port,\n};\n`,
    after: [
      `/// <reference types="node" />`,
      `import { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "const port = Number(process.env.PORT);",
      "export default {",
      "  users: port,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "writes imports below @ts-nocheck and above the comment governing the first statement",
    before: `// @ts-nocheck\n// @ts-expect-error -- the helper is untyped\nconst helper = require("./helper");\nexport default {\n  users: helper,\n};\n`,
    after: [
      "// @ts-nocheck",
      `import { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "// @ts-expect-error -- the helper is untyped",
      `const helper = require("./helper");`,
      "export default {",
      "  users: helper,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "writes imports below a JSX pragma in a block comment",
    before: "/** @jsxImportSource preact */\nexport default {\n  users: 1,\n};\n",
    after: [
      "/** @jsxImportSource preact */",
      `import { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default {",
      "  users: 1,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
  {
    name: "imports under the next free name when a var in a top-level block holds the name",
    before: `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nif (process.env.X) {\n  var courierConfig = {};\n}\n\nexport default defineMocks({});\n`,
    after: [
      `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig2 from "./courier.config";`,
      "if (process.env.X) {",
      "  var courierConfig = {};",
      "}",
      "",
      "export default defineMocks({",
      "  api: defineMockServer({",
      "    source: courierConfig2.sources.api,",
      "    autoStart: true,",
      "  }),",
      "});",
      "",
    ].join("\n"),
    literalKeys: [],
  },
  {
    name: "keeps an object inline when all of the file's code is on one line",
    before: `import { defineMockServer } from "@noverax/courier-mock"; import courierConfig from "./courier.config"; export default {};`,
    after: `import { defineMockServer } from "@noverax/courier-mock"; import courierConfig from "./courier.config"; export default { ${API_ENTRY} };`,
    literalKeys: [],
  },
  {
    name: "writes imports before the first statement, after a directive",
    before: `"use strict";\n\nexport default {\n  users: 1,\n};\n`,
    after: [
      `"use strict";`,
      "",
      `import { defineMockServer } from "@noverax/courier-mock";`,
      `import courierConfig from "./courier.config";`,
      "",
      "export default {",
      "  users: 1,",
      `  ${API_ENTRY},`,
      "};",
      "",
    ].join("\n"),
    literalKeys: ["users"],
  },
];

describe("planMocksEdit on an existing file", () => {
  it.each(ROWS)("$name", ({ before, after, requests, literalKeys }) => {
    const plan = planMocksEdit(editOf(before, requests));

    expect(plan.text).toBe(after);
    expect(plan.creates).toBe(false);
    expect(plan.literalKeys).toEqual(literalKeys);
    expect(plan.edits.every((edit) => edit.start === edit.end)).toBe(true);
    expect(applyEdits(before, plan.edits)).toBe(after);
    expect(parseErrors(after)).toEqual([]);
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
    ["LF", "\n"],
  ])(
    "writes the entries on a line of their own when %s ends a line comment in an empty object",
    (_what, terminator) => {
      const before = `${IMPORTS}\nexport default defineMocks({ // none yet${terminator}});\n`;

      const plan = planMocksEdit(editOf(before));

      expect(plan.text).toBe(
        `${IMPORTS}\nexport default defineMocks({ // none yet${terminator}  ${API_ENTRY},\n});\n`,
      );
      expect(parseErrors(plan.text)).toEqual([]);
    },
  );

  it("escapes a source key holding a surrogate without its partner", () => {
    const before = `${IMPORTS}\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before, [request("broken", { source: "a\ud800" })]));

    expect(plan.text).toContain(
      `broken: defineMockServer({ source: courierConfig.sources["a\\ud800"] }),`,
    );
    expect(plan.text.isWellFormed()).toBe(true);
  });

  it("returns ascending edits at UTF-16 offsets past non-ASCII text", () => {
    const before = `// Моки 🚀\n${IMPORTS}\nexport default defineMocks({\n  ${USERS}\n});\n`;

    const plan = planMocksEdit(editOf(before));

    const lastEnd = before.indexOf(USERS) + USERS.length;
    const closeLine = before.lastIndexOf("});");
    expect(plan.edits).toEqual([
      { start: lastEnd, end: lastEnd, text: "," },
      { start: closeLine, end: closeLine, text: `  ${API_ENTRY}\n` },
    ]);
  });

  it("inserts a BOM file's imports at offset 1, after the BOM", () => {
    const before = "\uFEFFexport default {\n  users: 1,\n};\n";

    const plan = planMocksEdit(editOf(before));

    expect(plan.edits[0]).toEqual({
      start: 1,
      end: 1,
      text: `import { defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\n`,
    });
  });
});

describe("planMocksEdit on a file without a default export", () => {
  const created = `${IMPORTS}\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`;

  it("writes the whole file into an empty one, exactly as it would create it", () => {
    const plan = planMocksEdit(editOf(""));

    expect(plan.text).toBe(created);
    expect(plan.edits).toEqual([{ start: 0, end: 0, text: created }]);
    expect(plan.literalKeys).toEqual([]);
    expect(plan.creates).toBe(false);
    expect(planMocksEdit({ ...editOf(""), existing: null }).text).toBe(created);
  });

  it("appends the imports and the export after a file's only comment", () => {
    const before = "// Mocks for local development.\n";

    const plan = planMocksEdit(editOf(before));

    expect(plan.text).toBe(`// Mocks for local development.\n\n${created}`);
    expect(plan.edits).toEqual([
      { start: before.length, end: before.length, text: `\n${created}` },
    ]);
    expect(parseErrors(plan.text)).toEqual([]);
  });

  it("appends the export after the file's other statements, a blank line between", () => {
    const before = `import { defineMockServer } from "@noverax/courier-mock";\n\nconst port = 4010;`;

    const plan = planMocksEdit(editOf(before));

    expect(plan.text).toBe(
      [
        `import { defineMockServer, defineMocks } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "const port = 4010;",
        "",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
    expect(plan.literalKeys).toEqual([]);
    expect(applyEdits(before, plan.edits)).toBe(plan.text);
    expect(parseErrors(plan.text)).toEqual([]);
  });

  it("calls defineMocks through the namespace the file imports", () => {
    const before = `import * as courier from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n`;

    const plan = planMocksEdit(editOf(before, [SEARCH]));

    expect(plan.text).toBe(
      `${before}\nexport default courier.defineMocks({\n  search: courier.defineMockServer({ source: courierConfig.sources.search }),\n});\n`,
    );
    expect(parseErrors(plan.text)).toEqual([]);
  });
});

describe("planMocksEdit creating the file", () => {
  function createOf(
    configName: string,
    configText: string | null,
    createName = "courier.mocks.ts",
  ): PlanInput {
    return { existing: null, createName, configName, configText, explicitExtensions: false, requests: [API] };
  }

  it.each([
    ["courier.config.ts", "./courier.config"],
    ["courier.config.mts", "./courier.config.mjs"],
    ["courier.config.cts", "./courier.config.cjs"],
    ["courier.config.js", "./courier.config.js"],
    ["courier.config.mjs", "./courier.config.mjs"],
    ["courier.config.cjs", "./courier.config.cjs"],
  ])("imports %s as %s", (configName, specifier) => {
    const plan = planMocksEdit(createOf(configName, null));

    expect(plan.text).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "${specifier}";`,
        "",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
    expect(plan.edits).toEqual([{ start: 0, end: 0, text: plan.text }]);
    expect(plan.literalKeys).toEqual([]);
    expect(plan.creates).toBe(true);
    expect(plan.configSpecifier).toBe(specifier);
    expect(parseErrors(plan.text)).toEqual([]);
  });

  it("writes in the config's style: quotes, semicolons, indentation, line endings, trailing commas", () => {
    const config = [
      "import { defineConfig } from '@noverax/courier'",
      "import { api } from './src/api'",
      "",
      "export default defineConfig({",
      "    sources: {",
      "        api",
      "    }",
      "})",
      "",
    ].join("\r\n");

    const plan = planMocksEdit(createOf("courier.config.mts", config, "courier.mocks.mts"));

    expect(plan.text).toBe(
      [
        "import { defineMocks, defineMockServer } from '@noverax/courier-mock'",
        "import courierConfig from './courier.config.mjs'",
        "",
        "export default defineMocks({",
        "    api: defineMockServer({",
        "        source: courierConfig.sources.api,",
        "        autoStart: true",
        "    })",
        "})",
        "",
      ].join("\r\n"),
    );
    expect(parseErrors(plan.text, "courier.mocks.mts")).toEqual([]);
  });

  it("writes Biome's defaults when the config's text is unknown", () => {
    const plan = planMocksEdit({
      ...createOf("courier.config.ts", null),
      requests: [API, BILLING],
    });

    expect(plan.text).toBe(
      [
        IMPORTS,
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "  billing: defineMockServer({",
        "    source: courierConfig.sources.billing,",
        "    port: 4010,",
        "    seed: { count: 50 },",
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
  });
});

describe("planMocksEdit beside a CommonJS config", () => {
  it.each([
    ["courier.config.cts", "./courier.config.cjs"],
    ["courier.config.cjs", "./courier.config.cjs"],
  ])("imports %s as %s into an existing file", (configName, specifier) => {
    const before = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before, [API], configName));

    expect(plan.text).toBe(
      `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "${specifier}";\n\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`,
    );
    expect(plan.configSpecifier).toBe(specifier);
  });

  it("reuses an existing import of a .cts config by the name it compiles to", () => {
    const before = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport config from "./courier.config.cts";\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before, [SEARCH], "courier.config.cts"));

    expect(plan.text).toContain("search: defineMockServer({ source: config.sources.search })");
    expect(plan.text.match(/import /g)).toHaveLength(2);
    expect(plan.configSpecifier).toBe("./courier.config.cts");
  });
});

describe("planMocksEdit naming the config's specifier", () => {
  it("names the specifier of the config import it reuses", () => {
    const before = `${IMPORTS.replace('"./courier.config"', '"./courier.config.ts"')}\nexport default defineMocks({});\n`;

    expect(planMocksEdit(editOf(before)).configSpecifier).toBe("./courier.config.ts");
  });

  it("names the specifier of the config import it adds", () => {
    const before = `import { defineMocks } from "@noverax/courier-mock";\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before));

    expect(plan.text).toContain(`import courierConfig from "./courier.config";`);
    expect(plan.configSpecifier).toBe("./courier.config");
  });

  it("names the added import's specifier when a type-only import of the config is not reused", () => {
    const before = `import type config from "./courier.config.ts";\nexport default {};\n`;

    expect(planMocksEdit(editOf(before)).configSpecifier).toBe("./courier.config");
  });
});

describe("planMocksEdit importing the config the way the project resolves modules", () => {
  const MOCK_IMPORT = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`;

  it.each([
    ["an import", `import { shared } from "./src/shared.js";`],
    ["a type import", `import type { Shared } from "../types/shared.js";`],
    ["a re-export", `export * from "./fixtures.mjs";`],
    ["a named re-export", `export { users } from "./fixtures/users.js";`],
  ])("imports a .ts config as .js into a file with %s that names its extension", (_, line) => {
    const before = `${line}\n${MOCK_IMPORT}\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before));

    expect(plan.text).toBe(
      `${line}\n${MOCK_IMPORT}\nimport courierConfig from "./courier.config.js";\n\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`,
    );
    expect(plan.configSpecifier).toBe("./courier.config.js");
    expect(parseErrors(plan.text)).toEqual([]);
  });

  it("imports a .ts config as .js where the project resolves modules as Node does", () => {
    const before = `${MOCK_IMPORT}\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit({ ...editOf(before), explicitExtensions: true });

    expect(plan.text).toContain(`import courierConfig from "./courier.config.js";`);
    expect(plan.configSpecifier).toBe("./courier.config.js");
  });

  it("creates the file importing a .ts config as .js where the project resolves modules as Node does", () => {
    const input: PlanInput = { ...editOf(""), existing: null, explicitExtensions: true };

    const plan = planMocksEdit(input);

    expect(plan.text).toBe(
      `${MOCK_IMPORT}\nimport courierConfig from "./courier.config.js";\n\nexport default defineMocks({\n  ${API_ENTRY},\n});\n`,
    );
    expect(plan.configSpecifier).toBe("./courier.config.js");
  });

  it("imports a .ts config without its extension where the project resolves modules as a bundler does", () => {
    const before = `${MOCK_IMPORT}\nimport { shared } from "./src/shared";\nimport { faker } from "faker/locale/en.js";\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit(editOf(before));

    expect(plan.text).toContain(`import courierConfig from "./courier.config";`);
    expect(plan.configSpecifier).toBe("./courier.config");
  });

  it("reuses an extensionless import of the config where the project names extensions", () => {
    const before = `${IMPORTS}\nexport default defineMocks({});\n`;

    const plan = planMocksEdit({ ...editOf(before), explicitExtensions: true });

    expect(plan.text.match(/import /g)).toHaveLength(2);
    expect(plan.configSpecifier).toBe("./courier.config");
  });

  it("imports a .cts config through .cjs whether or not the project names extensions", () => {
    const before = `${MOCK_IMPORT}\n\nexport default defineMocks({});\n`;

    const plan = planMocksEdit({ ...editOf(before, [API], "courier.config.cts"), explicitExtensions: true });

    expect(plan.configSpecifier).toBe("./courier.config.cjs");
  });
});

describe("planMocksEdit refusing", () => {
  it.each<[string, string, RefusalCode, string]>([
    [
      "a file that does not parse",
      "export default defineMocks({\n  users: 1\n  api: 2\n});\n",
      "PARSE_ERROR",
      "courier.mocks.ts does not parse: Expected `,` or `}` but found `Identifier` (line 3)",
    ],
    [
      "an assignment to module.exports",
      "module.exports = {\n  users: 1,\n};\n",
      "MOCKS_COMMONJS",
      "courier.mocks.ts exports with module.exports (line 1); Studio edits only a mocks file that is an ES module.",
    ],
    [
      "an assignment to a property of exports",
      "const a = 1;\nexports.users = a;\n",
      "MOCKS_COMMONJS",
      "courier.mocks.ts exports with exports (line 2); Studio edits only a mocks file that is an ES module.",
    ],
    [
      "export =",
      "export = {\n  users: 1,\n};\n",
      "MOCKS_COMMONJS",
      "courier.mocks.ts exports with export = (line 1); Studio edits only a mocks file that is an ES module.",
    ],
    [
      "an object held by let",
      "let mocks = {};\nexport default mocks;\n",
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts exports mocks, which is declared with let; Studio adds mocks only to an object held by a const.",
    ],
    [
      "a binding that is not a const of the file",
      `import mocks from "./shared";\nexport default mocks;\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts exports mocks, which is not a const declared in the file.",
    ],
    [
      "a call of an unknown function",
      "export default makeMocks({\n  users: 1,\n});\n",
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts exports the result of makeMocks(…), not of defineMocks from @noverax/courier-mock.",
    ],
    [
      "defineMocks imported only as a type",
      `import type { defineMocks } from "@noverax/courier-mock";\nexport default defineMocks({});\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts exports the result of defineMocks(…), not of defineMocks from @noverax/courier-mock.",
    ],
    [
      "defineMocks called with two arguments",
      `import { defineMocks } from "@noverax/courier-mock";\nexport default defineMocks({}, {});\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts calls defineMocks with something other than one object literal.",
    ],
    [
      "a default-exported function",
      "export default function mocks() {\n  return {};\n}\n",
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts exports a function or class as its default.",
    ],
    [
      "a re-exported default",
      `export { default } from "./shared-mocks";\n`,
      "MOCKS_NOT_LITERAL",
      `courier.mocks.ts exports a value re-exported from "./shared-mocks" as its default.`,
    ],
    [
      "two default exports",
      `${IMPORTS}\nexport default defineMocks({});\nconst m = {};\nexport { m as default };\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts declares more than one default export, so Studio cannot tell which one holds the mocks.",
    ],
    [
      "a default export that is an interface",
      `${IMPORTS}\nexport default interface Mocks {}\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts already declares a type as its default export, and TypeScript allows one default export per module, so Studio cannot add defineMocks as the default.",
    ],
    [
      "a type re-exported as the default",
      `${IMPORTS}\nexport type { Mocks as default } from "./types";\n`,
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts already declares a type as its default export, and TypeScript allows one default export per module, so Studio cannot add defineMocks as the default.",
    ],
    [
      "a getter among the mocks",
      "export default {\n  get users() {\n    return 1;\n  },\n};\n",
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts (line 2) declares a getter among the mocks; Studio adds only to an object of plain properties.",
    ],
    [
      "a method among the mocks",
      "export default {\n  users() {\n    return 1;\n  },\n};\n",
      "MOCKS_NOT_LITERAL",
      "courier.mocks.ts (line 2) declares a method among the mocks; Studio adds only to an object of plain properties.",
    ],
    [
      "a spread among the mocks",
      "const shared = {};\nexport default {\n  ...shared,\n  users: 1,\n};\n",
      "MOCKS_KEYS_HIDDEN",
      "courier.mocks.ts (line 3) spreads another object into the mocks, so Studio cannot see every key.",
    ],
    [
      "a computed key",
      `const name = "users";\nexport default {\n  [name]: 1,\n};\n`,
      "MOCKS_KEYS_HIDDEN",
      "courier.mocks.ts (line 3) computes a mock's key, so Studio cannot see every key.",
    ],
    [
      "a __proto__ key",
      "export default {\n  __proto__: null,\n};\n",
      "MOCKS_KEYS_HIDDEN",
      "courier.mocks.ts (line 2) sets the mocks object's prototype, which can supply keys Studio cannot see.",
    ],
    [
      "a local const named defineMockServer",
      `const defineMockServer = (config: unknown) => config;\n\nexport default {\n  users: 1,\n};\n`,
      "IMPORT_NAME_TAKEN",
      "courier.mocks.ts already declares defineMockServer on line 1, so Studio cannot import defineMockServer from @noverax/courier-mock under that name.",
    ],
    [
      "a type-only import of defineMockServer",
      `import { defineMocks } from "@noverax/courier-mock";\nimport type { defineMockServer } from "@noverax/courier-mock";\n\nexport default defineMocks({});\n`,
      "IMPORT_NAME_TAKEN",
      "courier.mocks.ts already declares defineMockServer on line 2, so Studio cannot import defineMockServer from @noverax/courier-mock under that name.",
    ],
    [
      "defineMocks taken in a file the edit must give a default export",
      `import { defineMockServer } from "@noverax/courier-mock";\nimport { defineMocks } from "./legacy";\n`,
      "IMPORT_NAME_TAKEN",
      "courier.mocks.ts already declares defineMocks on line 2, so Studio cannot import defineMocks from @noverax/courier-mock under that name.",
    ],
    [
      "a requested key the object already declares",
      `${IMPORTS}\nexport default defineMocks({\n  api: 1,\n});\n`,
      "INTERNAL_PLAN_REJECTED",
      `courier.mocks.ts already declares the mock "api".`,
    ],
  ])("refuses %s", (_what, text, code, message) => {
    expect(refusalOf(editOf(text))).toEqual({ code, message });
  });

  it("refuses a key requested twice", () => {
    expect(refusalOf(editOf(`${IMPORTS}\nexport default defineMocks({});\n`, [API, API]))).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: `Studio was asked twice for the mock "api".`,
    });
  });

  it("refuses an empty request", () => {
    expect(refusalOf(editOf(`${IMPORTS}\nexport default defineMocks({});\n`, []))).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: "Studio was asked to add no mocks to courier.mocks.ts.",
    });
  });

  it("names the source a duplicate key concerns", () => {
    let caught: unknown;
    try {
      planMocksEdit(editOf(`${IMPORTS}\nexport default defineMocks({\n  api: 1,\n});\n`));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MocksEditRefusal);
    expect((caught as MocksEditRefusal).source).toBe("api");
  });

  it("refuses a mocks file whose text it was not given", () => {
    expect(
      refusalOf({ ...editOf(""), existing: { name: "courier.mocks.ts", text: null } }),
    ).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: "Studio was asked to plan an edit of courier.mocks.ts without having read it.",
    });
  });
});
