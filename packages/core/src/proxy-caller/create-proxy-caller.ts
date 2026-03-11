import { buildClientProxy, type ExecuteBackend, type TypedClient } from "../client";
import type { DefinedApi } from "../define/types";
import { createProxyCallerFn, type ProxyCallerDefaults } from "./create-proxy-caller-fn";

/**
 * Create a typed proxy client for browser → server mode.
 * Sends requests to a proxy endpoint that forwards them to the backend.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (proxyUrl, timeout, credentials, etc.)
 *
 * @example
 * ```ts
 * const client = createProxyCaller<typeof api>("api");
 *
 * // Data only:
 * const users = await client.users.getAll();
 *
 * // Full HTTP response:
 * const response = await client.users.raw.getById({ id: 1 });
 *
 * // With options:
 * await client.users.with({ method: "GET" }).getAll();
 * ```
 */
export function createProxyCaller<T extends DefinedApi<any>>(
  source: string,
  defaults: ProxyCallerDefaults = {},
): TypedClient<T> {
  const fn = createProxyCallerFn(defaults);

  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    const callOptions = { ...options, ...(raw && { rawData: true }) };
    const executeFn = (fn as any)(source, callOptions);
    const endpointKey = `${group}:${method}`;

    return variables !== undefined ? executeFn(endpointKey, variables) : executeFn(endpointKey);
  };

  return buildClientProxy<T>(backend);
}
