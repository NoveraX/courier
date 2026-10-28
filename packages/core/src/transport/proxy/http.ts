import { createUntypedProxyCallerFn } from "../../proxy-caller/create-proxy-caller-fn";
import { routeCancelPreviousOf, routeKindOf, routeOf } from "../../proxy-caller/from-routes";
import type { ProxyCallerDefaults } from "../../proxy-caller/types";
import type { HTTPExecutor } from "../types";

/**
 * Create a proxy-mode HTTP executor that sends each call to the server's
 * proxy route (default `/api/request`), which runs it against the API the
 * application registered. The routes say whether a call reads or writes: a
 * read that may be cached goes as GET, any other call as POST, and a call
 * to a path they do not name as POST too.
 *
 * Used by createProxyCaller and createProxyQueryCaller.
 *
 * @param source - The name the application registered the API under
 * @param defaults - The client's options, and its routes
 * @returns The executor
 * @example
 * ```ts
 * const http = createProxyHTTPExecutor("api", { routes: apiRoutes, proxyPath });
 * ```
 */
export function createProxyHTTPExecutor(
  source: string,
  defaults: ProxyCallerDefaults = {},
): HTTPExecutor {
  const fn = createUntypedProxyCallerFn(defaults);
  const { routes } = defaults;

  return function executeHTTP(group, method, variables, options, raw) {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const route = routes ? routeOf(routes, group, method) : undefined;
    const endpointKey = group ? `${group}:${method}` : method;

    return fn(source, callOptions)(
      endpointKey,
      variables,
      routeKindOf(route),
      routeCancelPreviousOf(route),
    );
  };
}
