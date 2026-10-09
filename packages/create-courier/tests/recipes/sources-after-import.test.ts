import { afterAll, describe, expect, it } from "vitest";

import { honoRecipe } from "../../src/recipes/hono";
import { sourcesAfterImport } from "../../src/recipes/shared/sources-after-import";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const DECLARED = `import { defineConfig } from "@noverax/courier/config";
import { billing } from "./src/api/billing/source.js";
import { shop as store } from "./src/api/shop/source.js";

export default defineConfig({
  sources: {
    billing,
    store,
  },
  imports: { billing: { importType: "file", type: "openapi", outputDir: "src/api", sourceName: "billing" } },
});
`;

describe("sourcesAfterImport", () => {
  it("lists the APIs courier.config.ts declares, imported from where the server's code is", () => {
    const root = projectWith({ "courier.config.ts": DECLARED });

    const [file] = sourcesAfterImport("src/courier")(root);

    expect(file?.path).toBe("src/courier/sources.ts");
    expect(file?.content).toContain('import { billing } from "../api/billing/source.js";');
    expect(file?.content).toContain('import { store } from "../api/shop/source.js";');
    expect(file?.content).toContain("export const sources = { billing, store };");
  });

  it("writes nothing where the config declares no API", () => {
    const root = projectWith({
      "courier.config.ts": "export default defineConfig({ sources: {} });\n",
    });

    expect(sourcesAfterImport("src/courier")(root)).toEqual([]);
  });
});

describe("a server with a specification to import", () => {
  it("serves the proxy route alone, and lists the imported API once it is declared", () => {
    const root = projectWith({
      "package.json": manifest({ hono: "^4.13.13" }),
      "tsconfig.json": "{}",
      "src/index.ts": "",
    });
    const recipe = honoRecipe(contextOf(root, "hono", { openapi: "billing.json" }));
    const routes = recipe.files.find((file) => file.path === "src/courier/routes.ts");

    expect(routes?.content).toContain('courier.all("/api/request", courierHandler());');
    expect(routes?.content).not.toContain("courier.get(");
    expect(recipe.files.map((file) => file.path)).not.toContain("src/courier/sources.ts");
    expect(recipe.afterImport).toBeTypeOf("function");
  });
});
