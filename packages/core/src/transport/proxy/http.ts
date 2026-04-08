import { createUntypedProxyCallerFn } from "../../proxy-caller/create-proxy-caller-fn";
import type { ProxyCallerDefaults } from "../../proxy-caller/types";
import type { HTTPExecutor } from "../types";

/**
 * Create a proxy-mode HTTP executor that POSTs requests to the server's
 * proxy endpoint (default `/api/request`). The server-side adapter then
 * dispatches to the registered API source.
 *
 * Used by createProxyCaller (untyped proxy client) and
 * createProxyQueryCaller (React proxy mode).
 */
export function createProxyHTTPExecutor(
  source: string,
  defaults: ProxyCallerDefaults = {},
): HTTPExecutor {
  const fn = createUntypedProxyCallerFn(defaults);

  return function executeHTTP(group, method, variables, options, raw) {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const executeFn = fn(source, callOptions);
    const endpointKey = group ? `${group}:${method}` : method;

    return variables !== undefined ? executeFn(endpointKey, variables) : executeFn(endpointKey);
  };
}
