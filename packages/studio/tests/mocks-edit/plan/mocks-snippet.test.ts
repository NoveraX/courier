/**
 * The snippet a user is given to add by hand: the whole file when there is
 * none, otherwise the imports the file lacks and the entries to put inside
 * defineMocks, or the default export to append to a file without one; for a
 * file whose imports are unknown, the imports it may lack, marked as such —
 * never throwing, and never reading `mocks:`.
 */
import { describe, expect, it } from "vitest";

import { buildMocksSnippet } from "../../../src/server/mocks-edit/plan/mocks-snippet";
import type { PlanInput } from "../../../src/server/mocks-edit/plan/types";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

function request(key: string, overrides: Partial<MockDeclaration> = {}): MockDeclaration {
  return { key, source: key, port: null, seedCount: 20, autoStart: false, ...overrides };
}

const API = request("api", { autoStart: true });
const API_ENTRY = "api: defineMockServer({ source: courierConfig.sources.api, autoStart: true })";
const COMMENT = "// courier.mocks.ts, inside defineMocks({ ... })";

function snippetFor(text: string | null, overrides: Partial<PlanInput> = {}): string {
  return buildMocksSnippet({
    existing: text === null ? null : { name: "courier.mocks.ts", text },
    createName: "courier.mocks.ts",
    configName: "courier.config.ts",
    configText: null,
    explicitExtensions: false,
    requests: [API],
    ...overrides,
  });
}

describe("buildMocksSnippet without a mocks file", () => {
  it("is the whole file the planner would create", () => {
    expect(snippetFor(null)).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
  });

  it("imports a .cts config through the .cjs TypeScript resolves it by", () => {
    expect(snippetFor(null, { configName: "courier.config.cts" })).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config.cjs";`,
        "",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
  });

  it("follows the config's style", () => {
    const configText =
      "import { defineConfig } from '@noverax/courier'\n\nexport default defineConfig({\n\tsources: {},\n})\n";

    expect(snippetFor(null, { configText, requests: [request("search")] })).toBe(
      [
        "import { defineMocks, defineMockServer } from '@noverax/courier-mock'",
        "import courierConfig from './courier.config'",
        "",
        "export default defineMocks({",
        "\tsearch: defineMockServer({ source: courierConfig.sources.search }),",
        "})",
        "",
      ].join("\n"),
    );
  });
});

describe("buildMocksSnippet for a file that parses", () => {
  it("lists the imports the file lacks, then the entries", () => {
    expect(snippetFor("export default {\n  users: 1,\n};\n")).toBe(
      [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        COMMENT,
        `  ${API_ENTRY},`,
        "",
      ].join("\n"),
    );
  });

  it("lists no imports when the file has them all, and uses their names", () => {
    const text = [
      `import * as courier from "@noverax/courier-mock";`,
      `import config from "./courier.config";`,
      "",
      "export default courier.defineMocks({});",
      "",
    ].join("\n");

    expect(snippetFor(text, { requests: [request("search")] })).toBe(
      [COMMENT, "  search: courier.defineMockServer({ source: config.sources.search }),", ""].join(
        "\n",
      ),
    );
  });

  it("imports a taken name under the first free alias", () => {
    const text = `import { defineMocks } from "@noverax/courier-mock";\nconst defineMockServer = 1;\nexport default defineMocks({});\n`;

    expect(snippetFor(text, { requests: [request("search")] })).toBe(
      [
        `import { defineMockServer as defineMockServer2 } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        COMMENT,
        "  search: defineMockServer2({ source: courierConfig.sources.search }),",
        "",
      ].join("\n"),
    );
  });

  it("gives a file without a default export the whole statement the planner appends", () => {
    expect(snippetFor("const port = 4010;\n")).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "// courier.mocks.ts, at the end",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
  });

  it("calls defineMocks under the alias it imports when the name is taken", () => {
    const text = "// team mocks\nconst defineMocks = (m: object) => m;\n";

    expect(snippetFor(text)).toBe(
      [
        `import { defineMocks as defineMocks2, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "// courier.mocks.ts, at the end",
        "export default defineMocks2({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
  });

  it.each([
    "export default interface Mocks {}\n",
    `export type { Mocks as default } from "./types";\n`,
    "interface Mocks {}\nexport { type Mocks as default };\n",
    `export type * as default from "./types";\n`,
  ])(
    "gives the entries without an export statement for a file whose only default export is a type: %j",
    (defaultType) => {
      const text = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n${defaultType}`;

      expect(snippetFor(text)).toBe([COMMENT, `  ${API_ENTRY},`, ""].join("\n"));
    },
  );

  it("imports no defineMocks it does not call", () => {
    const text = `const defineMocks = 1;\nexport default {};\n`;

    expect(snippetFor(text).includes("defineMocks as")).toBe(false);
    expect(snippetFor(text)).toContain(`import { defineMockServer } from "@noverax/courier-mock";`);
  });

  it("follows the file's style", () => {
    const text =
      "import { defineMocks } from '@noverax/courier-mock'\r\n\r\nexport default defineMocks({\r\n\tusers: 1,\r\n})\r\n";

    expect(snippetFor(text, { requests: [request("search")] })).toBe(
      [
        "import { defineMockServer } from '@noverax/courier-mock'",
        "import courierConfig from './courier.config'",
        "",
        COMMENT,
        "\tsearch: defineMockServer({ source: courierConfig.sources.search }),",
        "",
      ].join("\r\n"),
    );
  });

  it("is still given for a file Studio refuses to edit", () => {
    expect(snippetFor("module.exports = {};\n", { requests: [request("search")] })).toBe(
      [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        COMMENT,
        "  search: defineMockServer({ source: courierConfig.sources.search }),",
        "",
      ].join("\n"),
    );
  });
});

describe("buildMocksSnippet importing the config the way the project resolves modules", () => {
  it("imports a .ts config as .js into a file whose relative imports name their extension", () => {
    const text = `import { shared } from "./src/shared.js";\n\nexport default {\n  users: 1,\n};\n`;

    expect(snippetFor(text)).toBe(
      [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config.js";`,
        "",
        COMMENT,
        `  ${API_ENTRY},`,
        "",
      ].join("\n"),
    );
  });

  it("writes the whole file importing a .ts config as .js where the project resolves modules as Node does", () => {
    expect(snippetFor(null, { explicitExtensions: true })).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config.js";`,
        "",
        "export default defineMocks({",
        `  ${API_ENTRY},`,
        "});",
        "",
      ].join("\n"),
    );
  });

  it("asks for the .js import of a .ts config in a file it did not read, where the project resolves modules as Node does", () => {
    const snippet = snippetFor(null, {
      existing: { name: "courier.mocks.ts", text: null },
      explicitExtensions: true,
    });

    expect(snippet).toContain(`\nimport courierConfig from "./courier.config.js";\n`);
  });

  it("imports a .ts config without its extension into a file whose relative imports carry none", () => {
    const text = `import { shared } from "./src/shared";\n\nexport default {};\n`;

    expect(snippetFor(text)).toContain(`\nimport courierConfig from "./courier.config";\n`);
  });
});

describe("buildMocksSnippet for a file Studio did not read", () => {
  it("asks for the imports the file does not have yet, under their default names, then the entries", () => {
    expect(snippetFor(null, { existing: { name: "courier.mocks.mts", text: null } })).toBe(
      [
        "// Add the imports courier.mocks.mts does not have yet:",
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        "// courier.mocks.mts, inside defineMocks({ ... })",
        `  ${API_ENTRY},`,
        "",
      ].join("\n"),
    );
  });
});

describe("buildMocksSnippet for a file that does not parse", () => {
  it("asks for the imports the file does not have yet, in Biome's style", () => {
    const text =
      "import { defineMocks } from 'x'\nexport default defineMocks({\n\tusers: 1\n\tapi: 2\n})\n";

    expect(snippetFor(text)).toBe(
      [
        "// Add the imports courier.mocks.ts does not have yet:",
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        COMMENT,
        `  ${API_ENTRY},`,
        "",
      ].join("\n"),
    );
  });

  it("does not present imports the file may already have as lines to add", () => {
    const text = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";\nimport courierConfig from "./courier.config";\n\nexport default defineMocks({\n  users: 1\n  api: 2\n});\n`;

    const snippet = snippetFor(text, { requests: [request("search")] });

    const head = snippet.slice(0, snippet.indexOf("import "));
    expect(head).toBe("// Add the imports courier.mocks.ts does not have yet:\n");
  });
});

describe("buildMocksSnippet guarantees", () => {
  it("never reads mocks:, whatever the keys", () => {
    const requests = [request("api_mocks", { source: "legacy mocks: v1" }), request("mocks")];

    const snippet = snippetFor("export default {};\n", { requests });

    expect(snippet).toBe(
      [
        `import { defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config";`,
        "",
        COMMENT,
        `  "api_mocks": defineMockServer({`,
        `    source: courierConfig.sources["legacy mocks\\x3a v1"],`,
        "  }),",
        `  "mocks": defineMockServer({ source: courierConfig.sources.mocks }),`,
        "",
      ].join("\n"),
    );
    expect(snippet.includes("mocks:")).toBe(false);
  });

  it("does not throw for requests the planner would refuse", () => {
    const requests = [request("api"), request("api")];

    expect(snippetFor(null, { requests, configName: "courier.config.cjs" })).toBe(
      [
        `import { defineMocks, defineMockServer } from "@noverax/courier-mock";`,
        `import courierConfig from "./courier.config.cjs";`,
        "",
        "export default defineMocks({",
        "  api: defineMockServer({ source: courierConfig.sources.api }),",
        "  api: defineMockServer({ source: courierConfig.sources.api }),",
        "});",
        "",
      ].join("\n"),
    );
  });
});
