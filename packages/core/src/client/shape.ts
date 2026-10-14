/**
 * The groups and endpoints a client can reach, read from its source.
 */

import { subGroupsOf } from "../define/group-tree";
import type { CourierRoutes } from "../define/routes";
import { sourceFromRoutes } from "../proxy-caller/from-routes";

/** What a source, or one of its groups, says a client may call there. */
export interface ClientShape {
  /** Each group inside it, with its own shape: its endpoints, and the groups inside it. */
  groups: ReadonlyMap<string, ClientShape>;
  /** Endpoints called at this level. */
  endpoints: ReadonlySet<string>;
}

/**
 * Read the shape of a `defineApi` result, or of the stand-in a page's routes make.
 *
 * @param source - The source, when the client was given one
 * @returns The shape, or `undefined` when the client knows only a name
 *
 * @example
 * ```ts
 * shapeOfSource(api)?.groups.get("users")?.endpoints; // → Set { "list", "getById" }
 * shapeOfSource(api)?.groups.get("billing")?.groups.get("invoices"); // → the shape of billing.invoices
 * ```
 */
export function shapeOfSource(
  source: Record<string, unknown> | undefined,
): ClientShape | undefined {
  return source ? shapeAt(source) : undefined;
}

/* A source's or a group's shape, the groups inside it read the same way. */
function shapeAt(holder: Record<string, unknown>): ClientShape {
  const groups = new Map<string, ClientShape>();
  for (const [name, group] of subGroupsOf(holder)) groups.set(name, shapeAt(group));
  return { groups, endpoints: new Set(endpointNames(holder)) };
}

/**
 * Read the shape of a page's client from its routes: the groups and the
 * endpoints they name, and nothing else of the API.
 *
 * @param routes - The routes of the API
 * @returns The shape
 *
 * @example
 * ```ts
 * shapeOfRoutes(apiRoutes).groups.get("users")?.endpoints; // → the endpoints the routes name in users
 * ```
 */
export function shapeOfRoutes(routes: CourierRoutes): ClientShape {
  return shapeAt(sourceFromRoutes(routes));
}

function endpointNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(
    (key) => key !== "options" && typeof record[key] === "object" && record[key] !== null,
  );
}
