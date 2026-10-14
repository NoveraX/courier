import type { CourierRoutes } from "@noverax/courier/define";

import type { NamedRoutes } from "./routes-module-text";

/* What separates the words of a source's name that an identifier cannot hold. */
const NOT_IN_A_NAME = /[^A-Za-z0-9_$]+/;
const LEADING_DIGIT = /^[0-9]/;

/** Each source's routes under the name the module exports them by, or why one cannot be. */
export type RoutesNaming =
  | { named: NamedRoutes[]; problem: null }
  | { named: null; problem: string };

/**
 * Name each source's routes as the routes module exports them: the
 * source's name with `Routes` after it, its words joined as one identifier
 * when the name is not one already — `apiRoutes` for `api`,
 * `myApiRoutes` for `my-api`.
 *
 * @param routes - Each source's routes
 * @returns The routes, each with its name; or why two sources would take one name, or a source none
 * @example
 * ```ts
 * nameRoutes([routesOf(api, "my-api")]).named?.[0]?.exportName; // → "myApiRoutes"
 * nameRoutes([routesOf(a, "my-api"), routesOf(b, "myApi")]).problem;
 * // → 'the sources "my-api" and "myApi" would both be exported as myApiRoutes; rename one of them'
 * ```
 */
export function nameRoutes(routes: readonly CourierRoutes[]): RoutesNaming {
  const named: NamedRoutes[] = [];
  const takenBy = new Map<string, string>();
  for (const each of routes) {
    const exportName = exportNameOf(each.source);
    if (exportName === null) {
      return {
        named: null,
        problem: `the source "${each.source}" has no name to export its routes under`,
      };
    }
    const other = takenBy.get(exportName);
    if (other !== undefined) {
      return {
        named: null,
        problem: `the sources "${other}" and "${each.source}" would both be exported as ${exportName}; rename one of them`,
      };
    }
    takenBy.set(exportName, each.source);
    named.push({ exportName, routes: each });
  }
  return { named, problem: null };
}

function exportNameOf(source: string): string | null {
  const words = source.split(NOT_IN_A_NAME).filter((word) => word !== "");
  if (words.length === 0) return null;
  const joined = words.map((word, index) => (index === 0 ? word : capitalized(word))).join("");
  return `${LEADING_DIGIT.test(joined) ? "_" : ""}${joined}Routes`;
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
