import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { DEMO_TEXT } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { studioScripts } from "./shared/recipe-parts";
import { vueDemo } from "./shared/vue-demo";

const DIR = "src/courier";

function caller(ctx: RecipeContext): RecipeFile {
  const path = `${DIR}/caller.ts`;
  const content = `import { createCaller } from "@noverax/courier";

import { api } from "${importSpecifier(path, `${DIR}/api.ts`, ctx.extension)}";

/** Your API's client, which the browser calls directly. */
export const courier = createCaller(api);
`;
  return { path, content, purpose: "your API's client for the browser" };
}

/* A page of its own, beside the app's: Vite serves every HTML file in the project's root while you develop. */
function demoEntry(): RecipeFile[] {
  const main = `${DIR}/main.ts`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>${DEMO_TEXT.title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/${main}"></script>
  </body>
</html>
`;
  const entry = `import { createApp } from "vue";

import CourierPage from "./CourierPage.vue";

createApp(CourierPage).mount("#app");
`;
  return [
    {
      path: "courier.html",
      content: html,
      purpose: "a page of its own that shows Courier at work",
    },
    { path: main, content: entry, purpose: "renders that page" },
  ];
}

/**
 * Courier in a Vue app Vite builds, with no server of its own: its API,
 * which the browser calls directly — the mock answers it from another
 * origin, as a backend would — a page of its own that shows it at work,
 * and Studio connected from Vite's config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * vueViteRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function vueViteRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, false)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...(example
        ? [
            caller(ctx),
            vueDemo(ctx, `${DIR}/CourierPage.vue`, `${DIR}/caller.ts`, "VITE_API_URL"),
            ...demoEntry(),
          ]
        : []),
    ],
    edits: ctx.choices.studio ? [viteStudioEdit(ctx.project, "vue")] : [],
    ...courierPackages(ctx, { runtime: false }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier.html" : undefined)],
  };
}
