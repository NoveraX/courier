import { afterAll, describe, expect, it } from "vitest";

import { solidStartRecipe } from "../../src/recipes/solid-start";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("solidStartRecipe", () => {
  it("registers the APIs in the route and names the page through @solidjs/meta where the app has it", () => {
    const root = projectWith({
      "package.json": manifest({
        "@solidjs/start": "^2.0.0",
        "@solidjs/meta": "^0.29.4",
        "solid-js": "^1.9.14",
      }),
      "tsconfig.json": "{}",
      "vite.config.ts":
        'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n',
    });
    const recipe = solidStartRecipe(contextOf(root, "@solidjs/start"));
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect(byPath.get("src/routes/api/request.ts")).toContain("registerSources(config.sources);");
    expect(byPath.get("src/routes/courier.tsx")).toContain("<Title>Courier is set up</Title>");
    expect(recipe.edits.map((edit) => edit.path)).toEqual(["vite.config.ts"]);
  });

  it("leaves Studio's plugin to the person in SolidStart 1's app.config.ts", () => {
    const root = projectWith({
      "package.json": manifest({ "@solidjs/start": "^1.1.0", "solid-js": "^1.9.0" }),
      "tsconfig.json": "{}",
      "app.config.ts":
        'import { defineConfig } from "@solidjs/start/config";\nexport default defineConfig({});\n',
    });
    const recipe = solidStartRecipe(contextOf(root, "@solidjs/start"));

    expect(recipe.edits).toEqual([]);
    expect(recipe.manual[0]?.file).toBe("app.config.ts");
    expect(
      recipe.files.find((file) => file.path === "src/routes/courier.tsx")?.content,
    ).not.toContain("@solidjs/meta");
  });
});
