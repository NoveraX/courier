import { isFormData, parseEndpointKey } from "../utils/helpers";
import { assertCarriable } from "./assert-carriable";
import { assertJsonVariables } from "./assert-json-variables";
import { handleGetProxy } from "./get-proxy";
import { buildPostPayload } from "./post-payload";
import { createProxyDedupe } from "./proxy-dedupe";
import { proxyRouting } from "./proxy-routing";
import { resolveProxyPath } from "./resolve-path";
import { sendFetch } from "./send-fetch";
import { splitProxyOptions } from "./split-options";
import type { ProxyCallerDefaults, UntypedCallerFn } from "./types";

export type { ProxyCallerDefaults } from "./types";

/**
 * The function the proxy transport sends calls through: given a source and a
 * call's options, it sends one endpoint's variables to the server's proxy
 * route and answers with what the server answered.
 *
 * It takes a call as the transport hands it on — the options as a record, the
 * endpoint by its key — so the typed clients in front of it are the one place
 * an API's types live, and nothing here casts a typed chain away.
 *
 * @param defaults - The caller's proxy path, headers, credentials, timeout,
 *   callbacks, and whether a read superseded by an identical one is cancelled
 * @returns The call function
 * @example
 * ```ts
 * const call = createUntypedProxyCallerFn({ proxyPath: { http: "/api/request" } });
 * await call("api")("users:byId", { id: "1" });
 * ```
 */
export function createUntypedProxyCallerFn(defaults: ProxyCallerDefaults = {}): UntypedCallerFn {
  const {
    proxyPath,
    credentials = "include",
    headers: defaultHeaders,
    timeout: defaultTimeout,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  const fetchCtx = { onSuccess: globalOnSuccess, onError: globalOnError };
  const dedupe = defaults.deduplicate ? createProxyDedupe() : undefined;

  return (source, options) => {
    const callSignal = options?.signal instanceof AbortSignal ? options.signal : undefined;

    async function send(
      endpoint: string,
      variables: unknown,
      signal: AbortSignal | undefined,
    ): Promise<unknown> {
      assertCarriable(variables);
      if (!isFormData(variables)) assertJsonVariables(variables);
      const { group, method } = parseEndpointKey(endpoint);
      // Lazy resolution: in SSR contexts the caller may be constructed in
      // Node where `globalThis.location` is undefined; resolving here guarantees
      // we read the live origin at the moment the request is actually sent.
      const url = resolveProxyPath("http", proxyPath);

      const call = splitProxyOptions(options, {
        headers: defaultHeaders,
        credentials,
        timeout: defaultTimeout,
      });
      const local = { ...call.init, cache: call.cache, next: call.next, signal };

      if (call.proxyMethod === "GET" && !isFormData(variables) && !call.onUploadProgress) {
        return handleGetProxy({
          url,
          source,
          group,
          method,
          variables,
          serverOptions: call.server,
          credentials: call.credentials,
          defaultHeaders: call.headers,
          init: local,
          timeout: call.timeout,
          onDownloadProgress: call.onDownloadProgress,
          stream: call.stream,
          fetchCtx,
        });
      }

      return sendFetch(
        "post",
        url,
        {
          ...local,
          /* The call's own query and body, which nothing a caller passes may replace. */
          searchParams: proxyRouting(source, group, method),
          ...buildPostPayload(variables, call.server),
          credentials: call.credentials,
          onUploadProgress: call.onUploadProgress,
          onDownloadProgress: call.onDownloadProgress,
          timeout: call.timeout,
          headers: call.headers,
        },
        { ...fetchCtx, stream: call.stream, raw: call.server.rawData === true },
      );
    }
    return (endpoint, variables) => {
      if (!dedupe) return send(endpoint, variables, callSignal);
      return dedupe.run(`${source}:${endpoint}`, callSignal, (signal) =>
        send(endpoint, variables, signal),
      );
    };
  };
}
