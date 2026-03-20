import { buildClientProxy, type ExecuteBackend, type InferClient } from "../client";
import { createProxyCallerFn, type ProxyCallerDefaults } from "./create-proxy-caller-fn";
import type { UntypedCallerFn } from "./types";

/**
 * Create a typed proxy client for browser → server mode.
 * Sends requests to a proxy endpoint that forwards them to the backend.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (proxyUrl, timeout, credentials, etc.)
 *
 * @example
 * ```ts
 * const client = createProxyCaller<typeof api>("api")
 *
 * // Grouped: client.users.getAll()
 * // Flat:    client.getFinances()
 * // Mixed:   both work simultaneously
 *
 * // .raw and .with() — at client level (applies to all calls):
 * await client.raw.users.getById({ id: 1 })
 * await client.with({ timeout: 5000 }).users.getAll()
 *
 * // .raw and .with() — at group level:
 * await client.users.raw.getById({ id: 1 })
 * await client.users.with({ timeout: 5000 }).getAll()
 *
 * // .raw and .with() — at flat method level:
 * await client.getFinances.raw()
 * await client.getFinances.with({ timeout: 5000 })()
 * ```
 */
export function createProxyCaller<TApi>(
  source: string,
  defaults?: ProxyCallerDefaults,
): InferClient<TApi>;

export function createProxyCaller(source: string, defaults: ProxyCallerDefaults = {}): unknown {
  const fn = createProxyCallerFn(defaults) as unknown as UntypedCallerFn;

  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const executeFn = fn(source, callOptions);
    const endpointKey = group ? `${group}:${method}` : method;

    return variables !== undefined ? executeFn(endpointKey, variables) : executeFn(endpointKey);
  };

  return buildClientProxy(backend);
}
