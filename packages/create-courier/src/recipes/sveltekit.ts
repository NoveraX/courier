import { viteStudioEdit } from "./edits/studio-browser";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyScripts, type RecipePart, registerModule, sortParts } from "./shared/recipe-parts";
import { svelteDemo } from "./shared/svelte-demo";
import { addsExample, needsWhat, type ServerNeeds, servingFile, startFile } from "./shared/wired";

const DIR = "src/lib/courier";

/* `hooks.server.ts`: the APIs registered as the server starts, and the server connected to Studio while you develop. */
function hooks(ctx: RecipeContext, needs: ServerNeeds): RecipeFile {
  const path = "src/hooks.server.ts";
  const content = registerModule(ctx, path, needs, "the /api/request route serves");
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
  const example = addsExample(ctx);
  const start = startFile(ctx, (needs) => hooks(ctx, needs), needsWhat, ["src/hooks.server.js"]);
  const route = servingFile(
    ctx,
    {
      path: "src/routes/api/request/+server.ts",
      content: ROUTE,
      purpose: "the route the browser calls your API through",
    },
    "@noverax/courier-sveltekit",
    "courierHandler",
  );
  const parts: RecipePart[] = [
    ...(start ? [start] : []),
    ...(ctx.choices.studio ? [viteStudioEdit(ctx.project, "sveltekit")] : []),
  ];
  const { files, edits, manual } = sortParts(parts);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...(route ? [route] : []),
      ...(example
        ? [
            proxyCaller(ctx, DIR),
            svelteDemo(ctx, "src/routes/courier/+page.svelte", `${DIR}/caller.ts`),
          ]
        : []),
      ...files,
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-sveltekit", proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
    /* An install removes the types svelte-kit sync wrote to node_modules/$app, which the tsconfig extends. */
    prepare: [{ bin: "svelte-kit", args: ["sync"] }],
  };
}
