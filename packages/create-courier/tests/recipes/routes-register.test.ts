/**
 * Where pages take their routes from Courier's plugin, the client the setup
 * writes takes `routes` from `@noverax/courier/routes` and registers the
 * config there, for its type alone, with the path from where it sits; with
 * `--routes file` it takes the routes module the CLI writes, as before.
 */
import { afterAll, describe, expect, it } from "vitest";

import { frameworkById } from "../../src/frameworks";
import { buildPlan } from "../../src/plan/build-plan";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const APPS = [
  {
    id: "sveltekit",
    marker: "@sveltejs/kit",
    packages: { "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1" },
    client: "src/lib/courier/caller.ts",
    config: "../../../courier.config",
  },
  {
    id: "nuxt",
    marker: "nuxt",
    packages: { nuxt: "^4.1.0" },
    files: { "app/app.vue": "<template><NuxtPage /></template>\n" },
    client: "shared/courier/caller.ts",
    config: "../../courier.config",
  },
  {
    id: "nuxt",
    marker: "nuxt",
    packages: { nuxt: "^3.17.0" },
    files: { "app.vue": "<template><NuxtPage /></template>\n" },
    client: "lib/courier/caller.ts",
    config: "../../courier.config",
  },
  {
    id: "astro",
    marker: "astro",
    packages: { astro: "^7.3.8" },
    client: "src/courier/caller.ts",
    config: "../../courier.config",
  },
  {
    id: "solid-start",
    marker: "@solidjs/start",
    packages: { "@solidjs/start": "^2.0.0", "solid-js": "^1.9.14" },
    client: "src/courier/caller.ts",
    config: "../../courier.config",
  },
  {
    id: "react-router",
    marker: "@react-router/dev",
    packages: { "@react-router/dev": "^7.9.0", react: "19.2.0" },
    client: "app/courier/query.ts",
    config: "../../courier.config",
  },
  {
    id: "next",
    marker: "next",
    packages: { next: "16.4.0", react: "19.2.0" },
    files: { "src/app/page.tsx": "export default function Home() { return null; }\n" },
    client: "src/courier/query.ts",
    config: "../../courier.config",
  },
];

function recipeFor(app: (typeof APPS)[number], routes?: "file") {
  const root = projectWith({
    "package.json": manifest(app.packages),
    "tsconfig.json": "{}",
    ...app.files,
  });
  const ctx = contextOf(root, app.marker, routes === undefined ? {} : { routes });
  const recipe = frameworkById(app.id).recipe?.(ctx);
  if (recipe === undefined) throw new Error(`${app.id} has no recipe`);
  return { ctx, recipe };
}

describe("a client of the routes Courier's plugin builds in", () => {
  for (const app of APPS) {
    it(`${app.id} (${app.client}): takes routes.api, and registers the config for its type alone`, () => {
      const { recipe } = recipeFor(app);
      const client = recipe.files.find((file) => file.path === app.client)?.content;

      expect(client).toContain('import { routes } from "@noverax/courier/routes";');
      expect(client).toContain(`import type config from "${app.config}";`);
      expect(client).toContain(
        'declare module "@noverax/courier/routes" {\n  interface Register {\n    config: typeof config;\n  }\n}',
      );
      expect(client).toContain("(routes.api);");
      expect(recipe.files.find((file) => file.path === "courier.config.ts")?.content).toContain(
        "  // Courier's plugin builds the pages' routes in: Studio writes no courier.routes.ts\n  studio: { routes: false },",
      );
      expect(recipe.files.map((file) => file.path)).not.toContain("courier.routes.ts");
      expect(recipe.scripts).toEqual({ studio: "courier-studio" });
      expect(
        [...recipe.dependencies, ...recipe.devDependencies].filter((name) =>
          name.startsWith("@noverax/courier-build"),
        ),
      ).toHaveLength(1);
      expect(recipe.devDependencies.filter((name) => name.includes("courier-cli"))).toEqual([]);
    });

    it(`${app.id} (${app.client}): takes the routes module the CLI writes with --routes file`, () => {
      const { ctx, recipe } = recipeFor(app, "file");
      const client = recipe.files.find((file) => file.path === app.client)?.content;

      expect(client).toContain("import { apiRoutes } from ");
      expect(client).not.toContain("@noverax/courier/routes");
      expect(recipe.files.find((file) => file.path === "courier.config.ts")?.content).not.toContain(
        "routes: false",
      );
      expect(recipe.files.map((file) => file.path)).toContain("courier.routes.ts");
      expect(recipe.scripts).toEqual({ studio: "courier-studio", routes: "courier-cli routes" });
      expect(
        buildPlan(ctx, recipe)
          .edits.map((edit) => edit.purpose)
          .join("; "),
      ).not.toContain("routes in");
    });
  }

  it("keeps Studio's port beside the setting, where the default port was taken", () => {
    const root = projectWith({
      "package.json": manifest({ "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1" }),
      "tsconfig.json": "{}",
    });
    const ctx = contextOf(root, "@sveltejs/kit", {}, { studio: 6281, mock: 7001 });
    const recipe = frameworkById("sveltekit").recipe?.(ctx);

    expect(recipe?.files.find((file) => file.path === "courier.config.ts")?.content).toContain(
      "  studio: { port: 6281, routes: false },",
    );
  });

  it("imports the config with the extension the project's imports carry", () => {
    const root = projectWith({
      "package.json": JSON.stringify({
        type: "module",
        dependencies: { "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1" },
      }),
      "tsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
    });
    const recipe = frameworkById("sveltekit").recipe?.(contextOf(root, "@sveltejs/kit"));

    expect(
      recipe?.files.find((file) => file.path === "src/lib/courier/caller.ts")?.content,
    ).toContain('import type config from "../../../courier.config.js";');
  });
});
