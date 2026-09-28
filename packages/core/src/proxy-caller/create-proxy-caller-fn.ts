import type { CallOptions } from "../http-client/types";
import type { CallerFn } from "../types";
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
 * Untyped variant of {@link createProxyCallerFn}, intended for internal
 * composition (transport primitives, generic callers).
 *
 * Returns the same runtime function but typed without the `TSources`
 * generic chain — the type erasure happens **once** at this boundary so
 * downstream code (e.g. `transport/proxy/http.ts`) doesn't need its own
 * `as unknown as ...` casts.
 */
export function createUntypedProxyCallerFn(defaults: ProxyCallerDefaults = {}): UntypedCallerFn {
  return createProxyCallerFn(defaults) as unknown as UntypedCallerFn;
}

export function createProxyCallerFn<
  TSources extends Record<string, unknown> = Record<string, unknown>,
>(defaults: ProxyCallerDefaults = {}): CallerFn<TSources> {
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

  const selectSource = (source: string, options?: CallOptions<boolean>) => {
    type Arguments = [string] | [string, unknown];

    function execute(...arguments_: Arguments): Promise<unknown> {
      const callSignal = options?.signal;
      if (!dedupe) return send(arguments_, callSignal);
      return dedupe.run(`${source}:${arguments_[0]}`, callSignal, (signal) =>
        send(arguments_, signal),
      );
    }

    async function send(arguments_: Arguments, signal: AbortSignal | null | undefined) {
      const [endpoint, variables] = arguments_;
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
    return execute;
  };

  return selectSource as unknown as CallerFn<TSources>;
}
