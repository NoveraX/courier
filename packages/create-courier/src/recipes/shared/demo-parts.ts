import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_CSS } from "./demo-style";
import { ROUTES_MODULE } from "./example-routes";
import { routesRegister } from "./routes-register";
import { addsMock } from "./wired";

/** The demo page's words, the same in every framework. */
export const DEMO_TEXT = {
  title: "Courier is set up",
  lead: "These users come from your API, through Courier, typed end to end.",
  loading: "Loading users…",
  add: "Add user",
} as const;

/** The expression a demo derives a new user's email from its name with, in TypeScript. */
export const EMAIL_FROM_NAME =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the generated code's own template literal
  '`${name.trim().toLowerCase().replace(/\\s+/g, ".")}@example.com`';

/**
 * The demo's styles with each rule's selector made global, for the
 * frameworks that scope a component's styles — Svelte's `:global(…)`.
 *
 * @returns The styles
 * @example
 * ```ts
 * globalDemoCss().startsWith(":global(.courier-demo)"); // true
 * ```
 */
export function globalDemoCss(): string {
  return DEMO_CSS.split("\n")
    .map((rule) =>
      rule.replace(/^([^{]+?)\s*\{/, (_, selector: string) => `:global(${selector}) {`),
    )
    .join("\n");
}

/**
 * `caller.ts`: the example API's client for the browser, typed from it,
 * which calls it through the app's `/api/request` route with the routes
 * the API's marks give — built in by Courier's plugin for the app's build,
 * which the module registers the config for, or from the routes module
 * Studio writes. The API's definition stays out of the bundle.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @returns The file
 * @example
 * ```ts
 * proxyCaller(ctx, "src/lib/courier");
 * ```
 */
export function proxyCaller(ctx: RecipeContext, dir: string): RecipeFile {
  const path = `${dir}/caller.ts`;
  const tail = `/** Your API's client for the browser, which calls it through the app's /api/request route. */
export const courier = createProxyCaller(`;
  const content =
    ctx.routes === "plugin"
      ? `import { createProxyCaller } from "@noverax/courier/client";
import { routes } from "@noverax/courier/routes";

${routesRegister(ctx, path)}
${tail}routes.api);
`
      : `import { createProxyCaller } from "@noverax/courier/client";

import { apiRoutes } from "${importSpecifier(path, ROUTES_MODULE, ctx.extension)}";

${tail}apiRoutes);
`;
  return { path, content, purpose: "your API's client for the browser" };
}

/**
 * The sentence a demo shows when the API does not answer, as plain text:
 * start the mock with the command that starts Studio, or name the
 * backend — only that where the setup adds no mock.
 *
 * @param ctx - The project, and what is set up in it
 * @param variable - The environment variable the API's address is read from
 * @returns The sentence
 * @example
 * ```ts
 * unreachableText(ctx, "VITE_API_URL"); // "Start the mock with npm run studio, or set VITE_API_URL to your backend."
 * ```
 */
export function unreachableText(ctx: RecipeContext, variable: string): string {
  return addsMock(ctx)
    ? `Start the mock with ${ctx.manager.run("studio")}, or set ${variable} to your backend.`
    : `Set ${variable} to your backend.`;
}
