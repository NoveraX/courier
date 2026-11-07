import { buildsWithRsbuild } from "./edits/config-integration";
import { routesPluginOf } from "./edits/framework-routes";
import { rsbuildStudioStep, viteStudioEdit } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { proxyCaller } from "./shared/demo-parts";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, rsbuildReach, studioStep, viteReach } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { proxyScripts, type RecipePart, registerModule, sortParts } from "./shared/recipe-parts";
import { routesPluginParts } from "./shared/routes-register";
import { solidDemo } from "./shared/solid-demo";
import {
  addsExample,
  addsMock,
  needsWhat,
  type ServerNeeds,
  servingFile,
  startFile,
} from "./shared/wired";

const DIR = "src/courier";
const SERVER_ENTRY = "src/server.ts";
const PAGE = `${DIR}/page.tsx`;
const SERVES = "the /api/request route serves";
/* What Courier does in an app Rsbuild builds. */
const RSBUILD_PAGE = "https://courier.noverax.cloud/docs/frameworks/tanstack-start#rsbuild";

/** What sets TanStack Start for React and for Solid apart in the setup. */
interface Flavor {
  readonly id: "tanstack-start-react" | "tanstack-start-solid";
  /** TanStack Start's package, whose `/server-entry` serves the app's requests. */
  readonly start: string;
  /** TanStack Router's package, whose `createFileRoute` the app's routes take. */
  readonly router: string;
  /** The page that shows Courier at work, and the modules it calls the API through, by the variable that names the API. */
  readonly demo: (ctx: RecipeContext, variable: string) => RecipeFile[];
}

const REACT: Flavor = {
  id: "tanstack-start-react",
  start: "@tanstack/react-start",
  router: "@tanstack/react-router",
  demo: (ctx, variable) => [
    reactQuery(ctx, DIR, "proxy"),
    reactDemo(ctx, { path: PAGE, query: `${DIR}/query.ts`, directive: "", variable }),
  ],
};

const SOLID: Flavor = {
  id: "tanstack-start-solid",
  start: "@tanstack/solid-start",
  router: "@tanstack/solid-router",
  demo: (ctx) => [proxyCaller(ctx, DIR), solidDemo(ctx, PAGE, `${DIR}/caller.ts`)],
};

/* `src/server.ts`: the APIs registered as the server starts — not in a route, whose module the
   browser loads too — and every request handed on to TanStack Start's own server entry. */
function serverEntry(ctx: RecipeContext, flavor: Flavor, needs: ServerNeeds): RecipeFile {
  const handler = `import handler from "${flavor.start}/server-entry";\n`;
  const start = registerModule(ctx, SERVER_ENTRY, needs, SERVES);
  const head = needs.register
    ? start.replace(/^import[^\n]*\n/, (line) => `${line}${handler}`)
    : `${handler}\n${start}`;
  return {
    path: SERVER_ENTRY,
    content: `${head}\nexport default handler;\n`,
    purpose: "registers your APIs as the server starts",
  };
}

/* The route the browser calls the API through; TanStack Start drops its handlers from the browser's code. */
function proxyRoute(flavor: Flavor): RecipeFile {
  return {
    path: "src/routes/api/request.ts",
    content: `import { apiRoute } from "@noverax/courier-tanstack-start";
import { createFileRoute } from "${flavor.router}";

/* Courier's proxy route: the browser calls your API through it. */
export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } });
`,
    purpose: "the route the browser calls your API through",
  };
}

/* The route of the page that shows Courier at work. */
function demoRoute(ctx: RecipeContext, flavor: Flavor): RecipeFile {
  const path = "src/routes/courier.tsx";
  return {
    path,
    content: `import { createFileRoute } from "${flavor.router}";

import CourierPage from "${importSpecifier(path, PAGE, ctx.extension)}";

/* The page that shows Courier at work. */
export const Route = createFileRoute("/courier")({ component: CourierPage });
`,
    purpose: "the route of the page that shows Courier at work",
  };
}

/* Courier in a TanStack Start app, for React or for Solid. */
function tanstackStartRecipe(ctx: RecipeContext, flavor: Flavor): Recipe {
  const example = addsExample(ctx);
  /* Built by Rsbuild, the app takes the plugins in Rsbuild's config and reads its own variable. */
  const rsbuild = buildsWithRsbuild(ctx.project);
  const reach = rsbuild ? rsbuildReach(ctx, true) : viteReach(ctx, true);
  const start = startFile(ctx, {
    file: (needs) => serverEntry(ctx, flavor, needs),
    what: needsWhat,
    others: ["src/server.tsx", "src/server.js", "src/server.mts", "src/server.mjs"],
    /* A server entry of the app's own hands requests on already: it lacks only Courier's lines. */
    inside: (needs) => ({
      what: needsWhat(needs),
      lines: registerModule(ctx, SERVER_ENTRY, needs, SERVES).trimEnd().split("\n"),
    }),
  });
  const route = servingFile(ctx, proxyRoute(flavor), "@noverax/courier-tanstack-start", "apiRoute");
  const studio = rsbuild
    ? rsbuildStudioStep(ctx.project, RSBUILD_PAGE)
    : viteStudioEdit(ctx.project, "vite");
  const parts: RecipePart[] = [
    ...(start ? [start] : []),
    ...routesPluginParts(ctx, routesPluginOf(ctx.project, flavor.id)),
    ...(ctx.choices.studio ? [studio] : []),
  ];
  const { files, edits, manual } = sortParts(parts);
  return {
    files: [
      ...(example ? exampleApi(ctx, DIR, reach) : []),
      courierConfig(ctx, `${DIR}/api.ts`),
      ...(addsMock(ctx) ? [courierMocks(ctx, `${DIR}/api.ts`)] : []),
      route,
      ...(example ? [...flavor.demo(ctx, reach.variable), demoRoute(ctx, flavor)] : []),
      ...files,
    ],
    edits,
    ...courierPackages(ctx, { adapter: "@noverax/courier-tanstack-start", proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
    /* TanStack Start writes the types of the app's routes, the setup's among them, as it builds the app. */
    prepare: [{ bin: rsbuild ? "rsbuild" : "vite", args: ["build"] }],
  };
}

/**
 * Courier in a TanStack Start app for React: its API, registered from the
 * server entry, the route the browser calls it through, a page that shows
 * it at work with React Query, Courier's plugin in Vite's config, which
 * builds the page's routes in, and Studio connected from the server entry
 * and Vite's config. An app Rsbuild builds takes the plugin in Rsbuild's
 * config, and Studio connects to its server alone.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * tanstackStartReactRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function tanstackStartReactRecipe(ctx: RecipeContext): Recipe {
  return tanstackStartRecipe(ctx, REACT);
}

/**
 * Courier in a TanStack Start app for Solid: as for React, with Solid's
 * page, which calls the API through Courier's proxy caller.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * tanstackStartSolidRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function tanstackStartSolidRecipe(ctx: RecipeContext): Recipe {
  return tanstackStartRecipe(ctx, SOLID);
}
