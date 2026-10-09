import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { nuxtRecipe } from "../../src/recipes/nuxt";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const NUXT_CONFIG = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})
`;
const APP_VUE =
  "<template>\n  <div>\n    <NuxtRouteAnnouncer />\n    <NuxtWelcome />\n  </div>\n</template>\n";

function app(extra: Record<string, string> = {}) {
  return projectWith({
    "package.json": manifest({ nuxt: "^4.6.0" }),
    "tsconfig.json": "{}",
    "nuxt.config.ts": NUXT_CONFIG,
    "app/app.vue": APP_VUE,
    ...extra,
  });
}

describe("nuxtRecipe", () => {
  it("shares the API from shared/, registers it from a Nitro plugin and serves it at /api/request", () => {
    const recipe = nuxtRecipe(contextOf(app(), "nuxt"));
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect(byPath.get("server/plugins/courier.ts")).toContain(
      "export default defineNitroPlugin(async () => {",
    );
    expect(byPath.get("server/plugins/courier.ts")).toContain("if (import.meta.dev) {");
    expect(byPath.get("server/api/request.ts")).toContain("export default courierHandler();");
    expect(byPath.get("shared/courier/api.ts")).toContain("serverEnv.API_URL");
    expect(byPath.get("app/pages/courier.vue")).toContain(
      'useHead({ title: "Courier is set up" });',
    );
    expect(byPath.get("app/pages/index.vue")).toContain("<NuxtWelcome />");
  });

  it("renders the app's pages where app.vue showed the welcome, and adds Studio's module", () => {
    const ctx = contextOf(app(), "nuxt");
    const edits = new Map(
      buildPlan(ctx, nuxtRecipe(ctx)).edits.map((edit) => [edit.path, edit.after]),
    );

    expect(edits.get("app/app.vue")).toBe(APP_VUE.replace("<NuxtWelcome />", "<NuxtPage />"));
    expect(edits.get("nuxt.config.ts")).toContain("modules: [courierStudioModule]");
    expect(edits.get("nuxt.config.ts")).toContain(
      "import { courierStudioModule } from '@noverax/courier-studio/nuxt'",
    );
  });

  it("leaves an app that renders its pages already as it is", () => {
    const recipe = nuxtRecipe(contextOf(app({ "app/pages/index.vue": "<template />\n" }), "nuxt"));

    expect(recipe.files.map((file) => file.path)).not.toContain("app/pages/index.vue");
    expect(recipe.edits.map((edit) => edit.path)).toEqual(["nuxt.config.ts"]);
  });

  it("keeps the API in lib/ in an app laid out as Nuxt 3 lays it out", () => {
    const root = projectWith({
      "package.json": manifest({ nuxt: "^3.17.0" }),
      "tsconfig.json": "{}",
      "app.vue": APP_VUE,
    });
    const paths = nuxtRecipe(contextOf(root, "nuxt")).files.map((file) => file.path);

    expect(paths).toContain("lib/courier/api.ts");
    expect(paths).toContain("pages/courier.vue");
  });
});
