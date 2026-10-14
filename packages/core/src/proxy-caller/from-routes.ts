import type { CourierRoutes } from "../define/routes";
import { sourceFromBoundary } from "./from-boundary";
import type { ProxyEndpointKind } from "./types";

/**
 * Turn routes into the shape the client's transport picker reads: a
 * stand-in for the API whose endpoints carry only how each is reached.
 *
 * @param routes - The routes of the API, from the module written for them
 * @returns The stand-in, its endpoints' schemas set and nothing else
 * @example
 * ```ts
 * composeBackend(sourceFromRoutes(apiRoutes), http, streaming);
 * ```
 */
export function sourceFromRoutes(routes: CourierRoutes): Record<string, unknown> {
  return sourceFromBoundary({ source: routes.source, endpoints: routes.endpoints });
}

/**
 * What the routes say of an HTTP endpoint: a read that may be cached, any
 * other read, or a write — or nothing, for a path they do not name or one
 * reached by a stream or a socket.
 *
 * @param routes - The routes of the API
 * @param group - The endpoint's group path, `""` for one at the top
 * @param method - The endpoint's name in its group
 * @returns Its kind, or `undefined`
 * @example
 * ```ts
 * routeKindOf(apiRoutes, "users", "list"); // → "cached-read" for { type: "query", get: true }
 * ```
 */
export function routeKindOf(
  routes: CourierRoutes,
  group: string,
  method: string,
): ProxyEndpointKind | undefined {
  const path = group ? `${group}.${method}` : method;
  const shape = Object.hasOwn(routes.endpoints, path) ? routes.endpoints[path] : undefined;
  if (shape === undefined || !("type" in shape)) return undefined;
  if (shape.type === "mutation") return "mutation";
  return "get" in shape && shape.get === true ? "cached-read" : "read";
}
