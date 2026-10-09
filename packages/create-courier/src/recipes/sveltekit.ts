import { viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import {
  ownOrManual,
  type RecipePart,
  sortParts,
  studioAttach,
  studioScripts,
} from "./shared/recipe-parts";
import { svelteDemo } from "./shared/svelte-demo";

const DIR = "src/lib/courier";

/* `hooks.server.ts`: the APIs registered as the server starts, and the server connected to Studio while you develop. */
function hooks(ctx: RecipeContext): RecipeFile {
  const path = "src/hooks.server.ts";
  const studio = ctx.choices.studio ? `\n\n${studioAttach("import.meta.env.DEV", "")}` : "";
  const content = `import { registerSources } from "@noverax/courier";

import config from "${importSpecifier(path, "courier.config.ts", ctx.extension)}";

/* The APIs courier.config.ts lists, which the /api/request route serves${ctx.choices.studio ? ";\n   while you develop, the server's calls show in Courier Studio" : ""}. */
registerSources(config.sources);${studio}
`;
  return { path, content, purpose: "registers your APIs as the server starts" };
}

const ROUTE = `import { courierHandler } from "@noverax/courier-sveltekit";

/* Courier's proxy route: the browser calls your API through it. */
const handler = courierHandler();

export const GET = handler;
export const POST = handler;
`;

/**
 * Courier in a SvelteKit app: its API, registered from `hooks.server.ts`,
 * the route the browser calls it through, a page that shows it at work,
 * and Studio connected from the hooks and Vite's config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * svelteKitRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function svelteKitRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  const what = ctx.choices.studio
    ? "Register Courier's APIs as the server starts, and connect it to Studio while you develop"
    : "Register Courier's APIs as the server starts";
  const parts: RecipePart[] = [
    ownOrManual(ctx, hooks(ctx), what, ["src/hooks.server.js"]),
    ...(ctx.choices.studio ? [viteStudioEdit(ctx.project, "sveltekit")] : []),
  ];
  const { files, edits, manual } = sortParts(parts);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      {
        path: "src/routes/api/request/+server.ts",
        content: ROUTE,
        purpose: "the route the browser calls your API through",
      },
      ...(example
        ? [
            proxyCaller(ctx, DIR),
            svelteDemo(ctx, "src/routes/courier/+page.svelte", `${DIR}/caller.ts`),
          ]
        : []),
      ...files,
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-sveltekit" }),
    scripts: studioScripts(ctx),
    manual,
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
    /* An install removes the types svelte-kit sync wrote to node_modules/$app, which the tsconfig extends. */
    prepare: [{ bin: "svelte-kit", args: ["sync"] }],
  };
}
