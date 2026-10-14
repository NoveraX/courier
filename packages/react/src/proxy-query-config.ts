import type { ProxyCallerDefaults, ProxyPath } from "@noverax/courier";
import type { CourierRoutes } from "@noverax/courier/define";
import { mergeProxyPath } from "@noverax/courier/internal";

/** What a proxy query client runs with: the source it calls, its routes, and its options merged. */
export interface ProxyQueryConfig {
  source: string;
  routes: CourierRoutes | undefined;
  defaults: ProxyCallerDefaults & { routes?: CourierRoutes | undefined };
}

/**
 * The configuration a proxy query client runs with, from what it was given:
 * its routes, or a source name with the API or a boundary. The proxy paths
 * a caller names win over those the source or the boundary carries, one
 * transport at a time; a caller's `cancelPrevious` and `coalesce` win over
 * those of the routes or the source — the API's own, which the hooks follow
 * as `createProxyCaller` does.
 *
 * @param first - The routes, or the source's name
 * @param given - The caller's options
 * @returns The source, the routes, and the options merged
 * @example
 * ```ts
 * proxyQueryConfig(apiRoutes, { proxyPath: { ws: "wss://realtime.example.com" } }).source; // → "api"
 * ```
 */
export function proxyQueryConfig(
  first: string | CourierRoutes,
  given: ProxyCallerDefaults = {},
): ProxyQueryConfig {
  const routes = typeof first === "string" ? undefined : first;
  const declared = routes ? undefined : (given.boundary?.proxyPath ?? proxyPathOf(given.source));
  const followed = routes ?? clientOptionsOf(given.source);
  return {
    source: routes ? routes.source : (first as string),
    routes,
    defaults: {
      ...given,
      proxyPath: mergeProxyPath(given.proxyPath, declared),
      cancelPrevious: given.cancelPrevious ?? followed?.cancelPrevious,
      coalesce: given.coalesce ?? followed?.coalesce,
      routes,
    },
  };
}

/* The options a source carries, read without its generic chain; any other shape carries none. */
function optionsOf(source: unknown): object | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const options: unknown = Reflect.get(source, "options");
  return typeof options === "object" && options !== null ? options : undefined;
}

/* The paths the source declares. */
function proxyPathOf(source: unknown): ProxyPath | undefined {
  const proxyPath: unknown = Reflect.get(optionsOf(source) ?? {}, "proxyPath");
  if (typeof proxyPath !== "object" || proxyPath === null) return undefined;
  const declared: ProxyPath = {};
  for (const key of ["http", "sse", "ws"] as const) {
    const value: unknown = Reflect.get(proxyPath, key);
    if (typeof value === "string") declared[key] = value;
  }
  return declared;
}

/* What the source says of cancelling and sharing reads, for its browser client. */
function clientOptionsOf(
  source: unknown,
): { cancelPrevious?: readonly string[]; coalesce?: boolean } | undefined {
  const options = optionsOf(source);
  if (options === undefined) return undefined;
  const cancelPrevious: unknown = Reflect.get(options, "cancelPrevious");
  const coalesce: unknown = Reflect.get(options, "coalesce");
  return {
    ...(Array.isArray(cancelPrevious) && { cancelPrevious: cancelPrevious.map(String) }),
    ...(typeof coalesce === "boolean" && { coalesce }),
  };
}
