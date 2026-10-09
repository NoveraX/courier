import { astroStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { ManualStep, Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { astroDemo } from "./shared/astro-demo";
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

const DIR = "src/courier";

/* `middleware.ts`, which Astro loads before it serves the route: the APIs registered, and the server connected to Studio while you develop. */
function middleware(ctx: RecipeContext): RecipeFile {
  const path = "src/middleware.ts";
  const studio = ctx.choices.studio ? `\n\n${studioAttach("import.meta.env.DEV", "")}` : "";
  const content = `import { registerSources } from "@noverax/courier";
import { defineMiddleware } from "astro/middleware";

import config from "${importSpecifier(path, "courier.config.ts", ctx.extension)}";

/* The APIs courier.config.ts lists, which the /api/request route serves${ctx.choices.studio ? ";\n   while you develop, the server's calls show in Courier Studio" : ""}. */
registerSources(config.sources);${studio}

/** Astro asks its middleware for an \`onRequest\`: this one passes every request on. */
export const onRequest = defineMiddleware((_context, next) => next());
`;
  return { path, content, purpose: "registers your APIs before the route serves them" };
}

const ROUTE = `import { courierHandler } from "@noverax/courier-astro";

/* Rendered on demand: a prerendered route would answer every call with one file built ahead of time. */
export const prerender = false;

/* Courier's proxy route: the browser calls your API through it. */
const handler = courierHandler();

export const GET = handler;
export const POST = handler;
`;

/* The route renders on demand, which a build needs a server adapter for. */
function adapterStep(ctx: RecipeContext, config: string | undefined): ManualStep[] {
  if (config === undefined || /\badapter\s*:/.test(config)) return [];
  return [
    {
      file: "astro.config",
      what: "Before you build, add a server adapter, for the route that renders on demand: Node's, or your host's",
      lines: [ctx.manager.exec("astro", ["add", "node"]).join(" ")],
    },
  ];
}

/**
 * Courier in an Astro site: its API, registered from the middleware, the
 * route the browser calls it through — rendered on demand — a page that
 * shows it at work, and Studio connected from the middleware and Astro's
 * config.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * astroRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function astroRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  const what = "Register Courier's APIs before the route serves them";
  const studioEdit = astroStudioEdit(ctx.project);
  const parts: RecipePart[] = [
    ownOrManual(ctx, middleware(ctx), what, [
      "src/middleware.js",
      "src/middleware/index.ts",
      "src/middleware/index.js",
    ]),
    ...(ctx.choices.studio ? [studioEdit] : []),
    ...adapterStep(ctx, ctx.project.read(studioEdit.path)),
  ];
  const { files, edits, manual } = sortParts(parts);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      {
        path: "src/pages/api/request.ts",
        content: ROUTE,
        purpose: "the route the browser calls your API through",
      },
      ...(example
        ? [proxyCaller(ctx, DIR), astroDemo(ctx, "src/pages/courier.astro", `${DIR}/caller.ts`)]
        : []),
      ...files,
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-astro" }),
    scripts: studioScripts(ctx),
    manual,
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
    prepare: [{ bin: "astro", args: ["sync"] }],
  };
}
