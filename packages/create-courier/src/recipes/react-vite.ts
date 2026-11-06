import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { studioScripts } from "./shared/recipe-parts";
import { VITE_PAGE, viteDevStep, vitePage } from "./shared/vite-page";
import { addsExample, addsMock } from "./shared/wired";

const DIR = "src/courier";

/* A page of its own, beside the app's, and the module that renders it. */
function demoEntry(ctx: RecipeContext): RecipeFile[] {
  const main = `${DIR}/main.tsx`;
  const entry = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import CourierPage from "${importSpecifier(main, `${DIR}/courier-page.tsx`, ctx.extension)}";

const root = document.getElementById("root");
if (root === null) throw new Error("${VITE_PAGE} has no #root to render into");

createRoot(root).render(
  <StrictMode>
    <CourierPage />
  </StrictMode>,
);
`;
  return [
    vitePage(ctx, "root", main),
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
      ...(addsMock(ctx) ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...(example ? [reactQuery(ctx, DIR, "direct"), reactDemo(ctx, page), ...demoEntry(ctx)] : []),
    ],
    edits: ctx.choices.studio ? [viteStudioEdit(ctx.project, "react")] : [],
    ...courierPackages(ctx, { runtime: false }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), example ? viteDevStep(ctx) : devStep(ctx, undefined)],
  };
}
