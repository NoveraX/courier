import { codeMatches, scanSource } from "../edit/source-scan";
import { astroStudioEdit } from "./edits/studio-browser";
import type { ManualStep, Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { astroDemo } from "./shared/astro-demo";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyScripts, type RecipePart, registerModule, sortParts } from "./shared/recipe-parts";
import { addsExample, needsWhat, type ServerNeeds, servingFile, startFile } from "./shared/wired";

const DIR = "src/courier";

/* `middleware.ts`, which Astro loads before it serves the route: the APIs registered, and the server connected to Studio while you develop. */
function middleware(ctx: RecipeContext, needs: ServerNeeds): RecipeFile {
  const path = "src/middleware.ts";
  const start = registerModule(ctx, path, needs, "the /api/request route serves");
  const define = 'import { defineMiddleware } from "astro/middleware";\n';
  const head = needs.register
    ? start.replace(/^import[^\n]*\n/, (line) => `${line}${define}`)
    : `${define}\n${start}`;
  const content = `${head}
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
  const scan = config === undefined ? undefined : scanSource(config);
  if (
    config === undefined ||
    (scan ? codeMatches(scan, /\badapter\s*:/g).length > 0 : /\badapter\s*:/.test(config))
  )
    return [];
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
  const example = addsExample(ctx);
  const what = (needs: ServerNeeds) =>
    needsWhat(needs, "Register Courier's APIs before the route serves them");
  const studioEdit = astroStudioEdit(ctx.project);
  const start = startFile(ctx, (needs) => middleware(ctx, needs), what, [
    "src/middleware.js",
    "src/middleware/index.ts",
    "src/middleware/index.js",
  ]);
  const route = servingFile(
    ctx,
    {
      path: "src/pages/api/request.ts",
      content: ROUTE,
      purpose: "the route the browser calls your API through",
    },
    "@noverax/courier-astro",
    "courierHandler",
  );
  const parts: RecipePart[] = [
    ...(start ? [start] : []),
    ...(ctx.choices.studio ? [studioEdit] : []),
    ...adapterStep(ctx, ctx.project.read(studioEdit.path)),
  ];
  const { files, edits, manual } = sortParts(parts);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, viteReach(ctx, true)) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      ...(route ? [route] : []),
      ...(example
        ? [proxyCaller(ctx, DIR), astroDemo(ctx, "src/pages/courier.astro", `${DIR}/caller.ts`)]
        : []),
      ...files,
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-astro", proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
    prepare: [{ bin: "astro", args: ["sync"] }],
  };
}
