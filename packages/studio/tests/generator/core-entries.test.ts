/**
 * What a generation imports of the core names the entry of the side that
 * loads the file. The proxy module, which a page imports, takes the proxy
 * caller from the page's entry, `@noverax/courier/client`, so the page's
 * bundle holds none of the server's part. The barrel's direct caller is
 * the server's, the one the root gives, and comes from
 * `@noverax/courier/server` — or, where a page alone loads the barrel, in a
 * project with no server side, a page's, from `@noverax/courier/client`, as
 * the proxy caller is. No file imports the root, so an upgrade that
 * moves the root's imports to the entries finds nothing of a generation's
 * to move, and asks for no regeneration that would write the same again.
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
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
                },
              },
            },
          },
        },
      },
      "/owners": {
        get: {
          operationId: "listOwners",
          tags: ["owners"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      schemas: { Pet: { type: "object", properties: { id: { type: "integer" } } } },
    },
  }),
);

function generated(options: Partial<GenerateOptions>) {
  return generateCode(SPEC, { type: "openapi", outputDir: "src/api", ...options }, "petStore");
}

/* The module of the core each import and re-export of a file names. */
function coreModules(content: string): string[] {
  const declarations = content.matchAll(
    /^(?:import|export) [^;]*? from "(@noverax\/courier(?:\/[^"]*)?)";$/gm,
  );
  return [...declarations].map(([, module]) => module ?? "");
}

describe("what a generation imports of the core", () => {
  it.each([
    ["from the routes module", {}],
    ["from Courier's plugin", { routesConfig: "courier.config.ts" }],
  ])("takes the proxy caller from the page's entry, its routes %s", (_case, options) => {
    const proxy = generated({ generateClient: "proxy", ...options }).find((file) =>
      file.path.endsWith("/proxy.ts"),
    );

    expect(proxy?.content).toContain(
      'import { createProxyCaller } from "@noverax/courier/client";',
    );
  });

  it("takes the direct caller from the server's entry", () => {
    const callers = generated({ generateClient: "direct" }).filter((file) =>
      file.content.includes(" createCaller("),
    );

    expect(callers.map((file) => coreModules(file.content))).toEqual([["@noverax/courier/server"]]);
  });

  it.each(["direct", "both"] as const)(
    "takes the direct caller from the page's entry where a page alone loads the barrel, writing %s callers",
    (generateClient) => {
      const files = generated({ generateClient, pageOnly: true });
      const callers = files.filter((file) => file.content.includes(" createCaller("));

      expect(callers.map((file) => coreModules(file.content))).toEqual([
        ["@noverax/courier/client"],
      ]);
    },
  );

  it.each([
    ["direct", {}],
    ["proxy", {}],
    ["both", {}],
    ["both", { routesConfig: "courier.config.ts" }],
    ["direct", { pageOnly: true }],
    ["both", { pageOnly: true }],
  ] as const)("imports nothing of the root where it writes %s callers", (generateClient, more) => {
    const files = generated({ generateClient, ...more });
    const ofRoot = files.filter((file) => coreModules(file.content).includes("@noverax/courier"));

    expect(files.some((file) => coreModules(file.content).length > 0)).toBe(true);
    expect(ofRoot.map((file) => file.path)).toEqual([]);
  });
});
