import type { NextStep, RecipeContext } from "../recipe-types";
import type { ExampleReach } from "./example-api";

import { ROUTES_COMMAND, STUDIO_COMMAND } from "./recipe-parts";
import { wantsRoutes } from "./wants-routes";
import { addsMock } from "./wired";

/**
 * The step that starts Studio — and with it the example's mock — where
 * Studio is set up.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The step, or none without Studio
 * @example
 * ```ts
 * studioStep(ctx); // [{ command: "npm run studio", what: "starts Courier Studio, and the mock API on port 7001" }]
 * ```
 */
export function studioStep(ctx: RecipeContext): NextStep[] {
  if (!ctx.choices.studio) return [];
  const mock = addsMock(ctx);
  const own = ctx.project.manifest.scripts.studio;
  const kept = own !== undefined && own !== STUDIO_COMMAND;
  const what = `starts Courier Studio on port ${ctx.ports.studio}${mock ? `, and the mock API on port ${ctx.ports.mock}` : ""}${kept ? `; your own studio script is kept as it is` : ""}`;
  const command = kept ? ctx.manager.exec(STUDIO_COMMAND, []).join(" ") : ctx.manager.run("studio");
  return [{ command, what }];
}

/**
 * The step that writes `courier.routes.ts` again, where pages call through
 * the proxy, take their routes from that file rather than Courier's
 * plugin, and no Studio writes it as you work: the `routes` script the
 * setup adds, or the CLI itself where a script of the project's own has
 * that name.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The step, or none where Studio or the plugin writes the routes
 * @example
 * ```ts
 * routesStep(ctx); // [{ command: "npm run routes", what: "writes courier.routes.ts again from the .expose() marks: run it after you change one" }]
 * ```
 */
export function routesStep(ctx: RecipeContext): NextStep[] {
  if (ctx.choices.studio || ctx.routes === "plugin" || !wantsRoutes(ctx)) return [];
  const own = ctx.project.manifest.scripts.routes;
  const kept = own !== undefined && own !== ROUTES_COMMAND;
  const command = kept
    ? ctx.manager.exec("courier-cli", ["routes"]).join(" ")
    : ctx.manager.run("routes");
  return [
    {
      command,
      what: `writes courier.routes.ts again from the .expose() marks: run it after you change one${kept ? "; your own routes script is kept as it is" : ""}`,
    },
  ];
}

/**
 * How a server reaches the example API: `API_URL` from the environment,
 * else the mock Studio runs; the browser through the app's route.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The reach
 * @example
 * ```ts
 * serverReach(ctx).baseUrl; // 'process.env.API_URL ?? "http://localhost:7001"'
 * ```
 */
export function serverReach(ctx: RecipeContext): ExampleReach {
  return {
    baseUrl: `process.env.API_URL ?? "http://localhost:${ctx.ports.mock}"`,
    variable: "API_URL",
    proxied: true,
  };
}

/**
 * How a server reaches the example API where its project may not load
 * Node's types — TypeScript 6 loads none unless the tsconfig names them, and
 * Nuxt's code shared with the browser has none: `API_URL` read through
 * `globalThis`, else the mock Studio runs.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The reach
 * @example
 * ```ts
 * portableServerReach(ctx).baseUrl; // 'serverEnv.API_URL ?? "http://localhost:7001"'
 * ```
 */
export function portableServerReach(ctx: RecipeContext): ExampleReach {
  const prelude = `/* The server's environment, read through globalThis, which needs no Node types; empty in a browser. */
const serverEnv =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

`;
  return {
    baseUrl: `serverEnv.API_URL ?? "http://localhost:${ctx.ports.mock}"`,
    variable: "API_URL",
    proxied: true,
    prelude,
  };
}

/**
 * How code Vite builds reaches the example API: `VITE_API_URL`, which
 * Vite reads from `.env` and builds in, else the mock Studio runs. Read
 * through `?.` so Studio and the MCP server, which load the module
 * outside Vite, fall back to the mock too.
 *
 * @param ctx - The project, and what is set up in it
 * @param proxied - Whether the browser calls it through the app's route
 * @returns The reach
 * @example
 * ```ts
 * viteReach(ctx, true).variable; // "VITE_API_URL"
 * ```
 */
export function viteReach(ctx: RecipeContext, proxied: boolean): ExampleReach {
  return {
    baseUrl: `import.meta.env?.VITE_API_URL ?? "http://localhost:${ctx.ports.mock}"`,
    variable: "VITE_API_URL",
    proxied,
  };
}

/**
 * How code Rsbuild builds reaches the example API: `PUBLIC_API_URL`, which
 * Rsbuild reads from `.env` and builds in, else the mock Studio runs. Read
 * through `?.`, as Vite's is.
 *
 * @param ctx - The project, and what is set up in it
 * @param proxied - Whether the browser calls it through the app's route
 * @returns The reach
 * @example
 * ```ts
 * rsbuildReach(ctx, true).variable; // "PUBLIC_API_URL"
 * ```
 */
export function rsbuildReach(ctx: RecipeContext, proxied: boolean): ExampleReach {
  return {
    baseUrl: `import.meta.env?.PUBLIC_API_URL ?? "http://localhost:${ctx.ports.mock}"`,
    variable: "PUBLIC_API_URL",
    proxied,
  };
}

/**
 * The script that starts the app while you develop: `dev`, else the one
 * the project starts with in its place.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The script's name; `dev` where the project has none of them
 * @example
 * ```ts
 * devScript(ctx); // "start:dev" in a NestJS app
 * ```
 */
export function devScript(ctx: RecipeContext): string {
  const scripts = ctx.project.manifest.scripts;
  return ["dev", "start:dev", "start"].find((name) => scripts[name] !== undefined) ?? "dev";
}

/**
 * The step that starts the app — its `dev` script, or the one it starts
 * with while you develop — and where to look.
 *
 * @param ctx - The project, and what is set up in it
 * @param page - The page that shows Courier at work, where the setup adds one
 * @returns The step
 * @example
 * ```ts
 * devStep(ctx, "/courier"); // { command: "npm run dev", what: "starts the app: open /courier at the address it prints" }
 * ```
 */
export function devStep(ctx: RecipeContext, page: string | undefined): NextStep {
  return {
    command: ctx.manager.run(devScript(ctx)),
    what:
      page === undefined
        ? "starts the app"
        : `starts the app: open ${page} at the address it prints`,
  };
}
