import { createUntypedProxyCallerFn } from "../../proxy-caller/create-proxy-caller-fn";
import { sourceFromBoundary } from "../../proxy-caller/from-boundary";
import type { ProxyCallerDefaults, ProxyEndpointKind } from "../../proxy-caller/types";
import { resolveEndpoint } from "../../utils/execute-resolve";
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
  /* A boundary says which of its endpoints write, as the source does. */
  const described = defaults.boundary ? sourceFromBoundary(defaults.boundary) : defaults.source;

  return function executeHTTP(group, method, variables, options, raw) {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const kind = kindOf(described, group, method);
    const endpointKey = group ? `${group}:${method}` : method;

    return fn(source, callOptions)(endpointKey, variables, kind);
  };
}

/**
 * How the source or the boundary describes an endpoint: a write, a read, a
 * read whose variables are sensitive and so go as a write's do, or unknown
 * without either.
 */
function kindOf(
  apiSource: Record<string, unknown> | undefined,
  group: string,
  method: string,
): ProxyEndpointKind | undefined {
  if (!apiSource) return undefined;
  const { schema, options } = resolveEndpoint(apiSource, group, method);
  if (schema?.type === "mutation") return "mutation";
  if (schema?.type !== "query") return undefined;
  return options?.sensitiveVariables === true ? "sensitive-read" : "read";
}
