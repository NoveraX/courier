import { createUntypedProxyCallerFn } from "../../proxy-caller/create-proxy-caller-fn";
import { sourceFromBoundary } from "../../proxy-caller/from-boundary";
import type { ProxyCallerDefaults } from "../../proxy-caller/types";
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
  /* Deduplication cancels the call a newer one supersedes, which only a read
     can afford: a cancelled write has usually been applied by the server
     while its caller is told it was not. */
  const writeFn = defaults.deduplicate
    ? createUntypedProxyCallerFn({ ...defaults, deduplicate: false })
    : fn;
  /* A boundary says which of its endpoints write, as the source does. */
  const described = defaults.boundary ? sourceFromBoundary(defaults.boundary) : defaults.source;

  return function executeHTTP(group, method, variables, options, raw) {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const chosen = isWrite(described, group, method) ? writeFn : fn;
    const executeFn = chosen(source, callOptions);
    const endpointKey = group ? `${group}:${method}` : method;

    return variables !== undefined ? executeFn(endpointKey, variables) : executeFn(endpointKey);
  };
}

/** Does the source or boundary describe this endpoint as a write? Unknown without one. */
function isWrite(
  apiSource: Record<string, unknown> | undefined,
  group: string,
  method: string,
): boolean {
  if (!apiSource) return false;
  return resolveEndpoint(apiSource, group, method).schema?.type === "mutation";
}
