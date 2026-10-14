import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { configSpecifiers } from "../../../src/server/mocks-edit/plan/config-specifiers";
import { collectModuleBindings } from "../../../src/server/mocks-edit/plan/module-bindings";
import type { ConfigImport } from "../../../src/server/mocks-edit/plan/resolve-config-import";
import { resolveConfigImport } from "../../../src/server/mocks-edit/plan/resolve-config-import";

function resolve(text: string, configName = "courier.config.ts"): ConfigImport {
  const { program } = parseSource("x.ts", text);
  return resolveConfigImport(
    program,
    collectModuleBindings(program),
    configSpecifiers(configName, false),
  );
}

describe("resolveConfigImport", () => {
  it("reuses a default import of the config under its own name and specifier", () => {
    expect(resolve(`import config from "./courier.config.ts";`)).toEqual({
      local: "config",
      specifier: "./courier.config.ts",
      add: false,
    });
  });

  it("reuses import { default as x }", () => {
    expect(resolve(`import { default as cfg } from "./courier.config.js";`)).toEqual({
      local: "cfg",
      specifier: "./courier.config.js",
      add: false,
    });
  });

  it("reuses the first of two imports of the config, with its specifier", () => {
    const text = `import a from "./courier.config.cts";\nimport b from "./courier.config.cjs";\n`;

    expect(resolve(text, "courier.config.cts")).toEqual({
      local: "a",
      specifier: "./courier.config.cts",
      add: false,
    });
  });

  it("does not reuse a type-only import, and imports anew under a free name", () => {
    expect(resolve(`import type courierConfig from "./courier.config";`)).toEqual({
      local: "courierConfig2",
      specifier: "./courier.config",
      add: true,
    });
    expect(resolve(`import { type default as courierConfig } from "./courier.config";`)).toEqual({
      local: "courierConfig2",
      specifier: "./courier.config",
      add: true,
    });
  });

  it("does not reuse an import of another specifier", () => {
    expect(resolve(`import config from "./courier.config.mjs";`)).toEqual({
      local: "courierConfig",
      specifier: "./courier.config",
      add: true,
    });
  });

  it("does not reuse a named import of the config", () => {
    expect(resolve(`import { sources } from "./courier.config";`)).toEqual({
      local: "courierConfig",
      specifier: "./courier.config",
      add: true,
    });
  });

  it("adds the import by the specifier TypeScript resolves the config's file by", () => {
    expect(resolve("", "courier.config.cts")).toEqual({
      local: "courierConfig",
      specifier: "./courier.config.cjs",
      add: true,
    });
  });

  it("skips every taken name", () => {
    expect(resolve("const courierConfig = 1;\nconst courierConfig2 = 2;\n")).toEqual({
      local: "courierConfig3",
      specifier: "./courier.config",
      add: true,
    });
  });
});
