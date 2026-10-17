import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { DEMO_TEXT } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { studioScripts } from "./shared/recipe-parts";
import { addsExample } from "./shared/wired";

const DIR = "src/courier";

/* A page of its own, beside the app's: Vite serves every HTML file in the project's root while you develop. */
function demoEntry(ctx: RecipeContext): RecipeFile[] {
  const main = `${DIR}/main.tsx`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>${DEMO_TEXT.title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${main}"></script>
  </body>
</html>
`;
  const entry = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import CourierPage from "${importSpecifier(main, `${DIR}/courier-page.tsx`, ctx.extension)}";

const root = document.getElementById("root");
if (root === null) throw new Error("courier.html has no #root to render into");

createRoot(root).render(
  <StrictMode>
    <CourierPage />
  </StrictMode>,
);
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
 * Courier in a React app Vite builds, with no server of its own: its API,
 * which the browser calls directly — the mock answers it from another
 * origin, as a backend would — React Query hooks for it, a page of its own
 * that shows it at work, and Studio connected from Vite's config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * reactViteRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function reactViteRecipe(ctx: RecipeContext): Recipe {
  const example = addsExample(ctx);
  const page = {
    path: `${DIR}/courier-page.tsx`,
    query: `${DIR}/query.ts`,
    directive: "",
    variable: "VITE_API_URL",
  };
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, false)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...(example ? [reactQuery(ctx, DIR, "direct"), reactDemo(ctx, page), ...demoEntry(ctx)] : []),
    ],
    edits: ctx.choices.studio ? [viteStudioEdit(ctx.project, "react")] : [],
    ...courierPackages(ctx, { react: true, runtime: false }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier.html" : undefined)],
  };
}
