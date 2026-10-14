import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";

/** Where the routes module goes: beside courier.config.ts, where Studio writes it. */
export const ROUTES_MODULE = "courier.routes.ts";

/**
 * `courier.routes.ts`: the routes the browser's client of the example API
 * takes — each endpoint the API marks for a page, and how the page reaches
 * it — as Courier Studio writes the module from the marks. Written with the
 * project, it compiles before Studio first runs, and Studio finds it as it
 * would write it.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The file
 * @example
 * ```ts
 * exampleRoutes(ctx).path; // "courier.routes.ts"
 * ```
 */
export function exampleRoutes(ctx: RecipeContext): RecipeFile {
  const config = importSpecifier(ROUTES_MODULE, "courier.config.ts", ctx.extension);
  const content = `// Written by Courier Studio from courier.config.ts. Do not edit it:
// \`courier-studio routes\` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type config from "${config}";

type Sources = (typeof config)["sources"];

const apiEndpoints = {
  "users.create": { type: "mutation" },
  "users.get": { type: "query" },
  "users.list": { type: "query" },
} as const satisfies RouteMap<Sources["api"]>;

/** What a page's proxy client may call of \`api\`, and how it reaches each endpoint. */
export const apiRoutes: CourierRoutes<Sources["api"], typeof apiEndpoints> = {
  source: "api",
  endpoints: apiEndpoints,
};
`;
  return {
    path: ROUTES_MODULE,
    content,
    purpose: "the endpoints a page may call, written again by Studio as you mark them",
  };
}
