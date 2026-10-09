import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { reactRouterRecipe } from "../../src/recipes/react-router";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const ROUTES =
  'import { type RouteConfig, index } from "@react-router/dev/routes";\n\nexport default [index("routes/home.tsx")] satisfies RouteConfig;\n';

function app(routes: string | undefined) {
  return projectWith({
    "package.json": manifest({ "@react-router/dev": "^8.4.0", react: "^19.2.8" }),
    "tsconfig.json": "{}",
    ...(routes === undefined ? {} : { "app/routes.ts": routes }),
  });
}

describe("reactRouterRecipe", () => {
  it("registers the APIs in the route the browser calls, and lists both routes", () => {
    const ctx = contextOf(app(ROUTES), "@react-router/dev");
    const recipe = reactRouterRecipe(ctx);
    const route = recipe.files.find((file) => file.path === "app/routes/api.request.ts");
    const routes = buildPlan(ctx, recipe).edits.find((edit) => edit.path === "app/routes.ts");

    expect(route?.content).toContain("registerSources(config.sources);");
    expect(route?.content).toContain("export const action = handler;");
    expect(routes?.after).toBe(
      'import { type RouteConfig, index, route } from "@react-router/dev/routes";\n\nexport default [index("routes/home.tsx"), route("courier", "routes/courier.tsx"), route("api/request", "routes/api.request.ts")] satisfies RouteConfig;\n',
    );
  });

  it("lists nothing where the routes come from the file system", () => {
    const flat =
      'import { flatRoutes } from "@react-router/fs-routes";\n\nexport default flatRoutes();\n';
    const ctx = contextOf(app(flat), "@react-router/dev");

    expect(
      buildPlan(ctx, reactRouterRecipe(ctx)).edits.find((edit) => edit.path === "app/routes.ts")
        ?.state,
    ).toBe("same");
  });

  it("needs no list in a Remix app, whose file routes serve themselves", () => {
    const recipe = reactRouterRecipe(contextOf(app(undefined), "@react-router/dev"));

    expect(recipe.edits.map((edit) => edit.path)).toEqual(["vite.config.ts"]);
  });
});
