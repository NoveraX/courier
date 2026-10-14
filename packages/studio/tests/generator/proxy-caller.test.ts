/**
 * An import's proxy caller takes the source's routes from the project's
 * routes module, wherever the config puts it, by the name the module exports
 * them under — and the source it calls marks every endpoint for a page to
 * call, which a direct caller alone does not.
 */
import { describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pet Store", version: "1" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);

function fileOf(options: Partial<GenerateOptions>, end: string, name = "petStore"): string {
  const files = generateCode(SPEC, { type: "openapi", outputDir: "src/api", ...options }, name);
  return files.find((file) => file.path.endsWith(end))?.content ?? "";
}

describe("a proxy caller's routes", () => {
  it("come from the routes module beside the config, under the source's name", () => {
    const proxy = fileOf({ generateClient: "proxy" }, "/proxy.ts");

    expect(proxy).toContain('import { petStoreRoutes } from "../../../courier.routes";');
    expect(proxy).toContain("export const petStoreProxyApi = createProxyCaller(petStoreRoutes);");
  });

  it("come from wherever the config puts the module, with the extension the project's imports carry", () => {
    const nested = fileOf(
      { generateClient: "both", routesModule: "src/lib/courier.routes.ts" },
      "/proxy.ts",
    );
    const explicit = fileOf(
      { generateClient: "both", routesModule: "courier.routes.mts", importExtension: ".js" },
      "/proxy.ts",
    );

    expect(nested).toContain('from "../../lib/courier.routes";');
    expect(explicit).toContain('from "../../../courier.routes.mjs";');
  });

  it("are exported under the name courier.config keys the source by", () => {
    const proxy = fileOf({ generateClient: "proxy" }, "/proxy.ts", "pet-store");

    expect(proxy).toContain("import { petStoreRoutes } from");
  });
});

describe("the source a proxy caller calls", () => {
  it.each(["proxy", "both"] as const)(
    "marks every endpoint for a page to call, with %s callers",
    (client) => {
      const source = fileOf({ generateClient: client }, "/source.ts");

      expect(source).toContain(
        "  /** A page may call every endpoint through the proxy; `.expose(false)` keeps one to the server. */\n  expose: true,",
      );
    },
  );

  it("marks them without a word where the import leaves comments out", () => {
    const source = fileOf({ generateClient: "proxy", includeComments: false }, "/source.ts");

    expect(source).toContain("  expose: true,");
    expect(source).not.toContain("A page may call");
  });

  it("marks none for a direct caller alone", () => {
    expect(fileOf({ generateClient: "direct" }, "/source.ts")).not.toContain("expose");
  });
});
