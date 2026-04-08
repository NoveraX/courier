import type { CallOptions } from "../http-client/types";
import type { CallerFn } from "../types";
import { isFormData, parseEndpointKey } from "../utils/helpers";
import { handleGetProxy } from "./get-proxy";
import { buildPostPayload } from "./post-payload";
import { resolveProxyPath } from "./resolve-path";
import { sendFetch } from "./send-fetch";
import type { ProxyCallerDefaults, UntypedCallerFn } from "./types";
import { handleXhrUpload } from "./xhr-handler";

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

  const selectSource = (source: string, options?: CallOptions<boolean>) => {
    async function execute(...arguments_: [string] | [string, FormData | Record<string, unknown>]) {
      const [endpoint, variables] = arguments_;
      const { group, method } = parseEndpointKey(endpoint);
      // Lazy resolution: in SSR contexts the caller may be constructed in
      // Node where `globalThis.location` is undefined; resolving here guarantees
      // we read the live origin at the moment the request is actually sent.
      const url = resolveProxyPath("http", proxyPath);

      const {
        cache,
        onDownloadProgress,
        onUploadProgress,
        signal,
        stream,
        method: proxyMethod,
        ...extraOptions
      } = options || {};

      const next = (options as Record<string, unknown> | undefined)?.next as
        | Record<string, unknown>
        | undefined;

      if (extraOptions.timeout === undefined && defaultTimeout !== undefined) {
        extraOptions.timeout = defaultTimeout;
      }

      const serverOptions = {
        ...extraOptions,
        ...(stream && { stream }),
        ...(cache && { cache }),
      };

      if (proxyMethod === "GET" && !isFormData(variables) && !onUploadProgress) {
        return handleGetProxy({
          url,
          source,
          group,
          method,
          variables,
          serverOptions,
          credentials,
          defaultHeaders,
          signal,
          timeout: extraOptions.timeout,
          cache,
          next,
          onDownloadProgress,
          stream: !!stream,
          fetchCtx,
        });
      }

      const requestPayload = buildPostPayload(source, group, method, variables, serverOptions);

      if (onUploadProgress) {
        return handleXhrUpload({
          url,
          requestPayload,
          variables,
          defaultHeaders,
          credentials,
          timeout: extraOptions.timeout,
          signal,
          onUploadProgress,
          stream: !!stream,
          cache,
          next,
          onDownloadProgress,
          globalOnSuccess,
          globalOnError,
        });
      }

      return sendFetch(
        "post",
        url,
        {
          ...requestPayload,
          credentials,
          cache,
          next,
          onDownloadProgress,
          signal,
          timeout: extraOptions.timeout,
          headers: defaultHeaders,
        },
        {
          ...fetchCtx,
          stream: !!stream,
          requestPayload,
        },
      );
    }
    return execute;
  };

  return selectSource as unknown as CallerFn<TSources>;
}
