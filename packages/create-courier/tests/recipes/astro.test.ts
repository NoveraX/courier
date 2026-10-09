import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { astroRecipe } from "../../src/recipes/astro";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const CONFIG =
  "// @ts-check\nimport { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n";

describe("astroRecipe", () => {
  it("registers the APIs from the middleware and serves them from a route rendered on demand", () => {
    const root = projectWith({
      "package.json": manifest({ astro: "^7.3.8" }),
      "tsconfig.json": "{}",
      "astro.config.mjs": CONFIG,
    });
    const ctx = contextOf(root, "astro");
    const recipe = astroRecipe(ctx);
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect(byPath.get("src/middleware.ts")).toContain(
      'import { defineMiddleware } from "astro/middleware";',
    );
    expect(byPath.get("src/pages/api/request.ts")).toContain("export const prerender = false;");
    expect(byPath.get("src/pages/courier.astro")).toContain(
      'import { courier } from "../courier/caller";',
    );
    expect(recipe.prepare).toEqual([{ bin: "astro", args: ["sync"] }]);
    expect(recipe.manual[0]?.lines).toEqual(["npm exec -- astro add node"]);
    expect(buildPlan(ctx, recipe).edits[0]?.after).toContain("integrations: [courierStudio()],");
  });

  it("asks for no adapter where the config has one", () => {
    const root = projectWith({
      "package.json": manifest({ astro: "^7.3.8" }),
      "tsconfig.json": "{}",
      "astro.config.mjs":
        "import node from '@astrojs/node';\nexport default defineConfig({ adapter: node({ mode: 'standalone' }) });\n",
    });

    expect(astroRecipe(contextOf(root, "astro")).manual).toEqual([]);
  });
});
