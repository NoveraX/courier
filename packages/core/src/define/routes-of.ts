import { isExposedToWire } from "../adapter/exposure";
import { eachEndpoint, type PlacedEndpoint } from "../openapi/endpoints";
import type { ExposablePath } from "./endpoint-path-types";
import type { CourierRoutes, RouteMap, RouteShape } from "./routes";

/* How the browser reaches an endpoint, read off its definition. A read goes as GET only
   when it may be cached and its variables may sit in an address; any other read goes as
   POST, so a read nobody marked keeps its variables out of every log on the way. */
function routeShapeOf(endpoint: PlacedEndpoint): RouteShape {
  if (endpoint.kind === "stream") return { transport: "sse" };
  if (endpoint.kind === "channel") {
    return endpoint.schemas.bidirectional === true
      ? { transport: "ws", bidirectional: true }
      : { transport: "ws" };
  }
  if (endpoint.kind === "mutation") return { type: "mutation" };
  const cached = endpoint.schemas.cache !== undefined;
  const sensitive = endpoint.options.sensitiveVariables === true;
  return cached && !sensitive ? { type: "query", get: true } : { type: "query" };
}

/**
 * The routes of an API, typed as it is: held to its paths and shapes when
 * its type names them, and routes of no API in particular when its type is
 * a record of anything.
 */
export type RoutesOf<TApi> =
  string extends ExposablePath<TApi> ? CourierRoutes : CourierRoutes<TApi, RouteMap<TApi>>;

/**
 * The routes of an API: every endpoint the proxy serves to a browser, by
 * its path, in the order the paths sort, and how the browser reaches it —
 * read off the definition by the same rules the proxy applies, so routes
 * written from them name nothing the proxy would refuse.
 *
 * @param api - The API, as `defineApi` returns it
 * @param source - The name the application registers it under
 * @returns The routes, for a module a page's proxy client imports
 * @example
 * ```ts
 * routesOf(api, "api").endpoints; // → { "users.get": { type: "query", get: true }, "users.update": { type: "mutation" } }
 * ```
 */
export function routesOf<TApi extends object>(api: TApi, source: string): RoutesOf<TApi>;

export function routesOf(api: object, source: string): CourierRoutes {
  const exposed: Array<[string, RouteShape]> = [];
  for (const endpoint of eachEndpoint(api)) {
    const group = endpoint.group === "" ? undefined : endpoint.group;
    if (!isExposedToWire(api, group, endpoint.schemas)) continue;
    exposed.push([endpoint.id, routeShapeOf(endpoint)]);
  }
  exposed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const { cancelPrevious, coalesce } = clientOptionsOf(api);
  return {
    source,
    endpoints: Object.fromEntries(exposed),
    ...(cancelPrevious !== undefined && { cancelPrevious }),
    ...(coalesce !== undefined && { coalesce }),
  };
}

/* The options of the API its browser client follows too, read without its generic chain. */
function clientOptionsOf(api: object): { cancelPrevious?: readonly string[]; coalesce?: boolean } {
  const options: unknown = Reflect.get(api, "options");
  if (typeof options !== "object" || options === null) return {};
  const cancelPrevious: unknown = Reflect.get(options, "cancelPrevious");
  const coalesce: unknown = Reflect.get(options, "coalesce");
  return {
    ...(Array.isArray(cancelPrevious) && { cancelPrevious: cancelPrevious.map(String) }),
    ...(typeof coalesce === "boolean" && { coalesce }),
  };
}
