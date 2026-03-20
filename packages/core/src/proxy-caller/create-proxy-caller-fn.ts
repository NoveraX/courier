import type { CallOptions } from "../http-client/types";
import type { CallerFn } from "../types";
import { isFormData, parseEndpointKey } from "../utils/helpers";
import { handleGetProxy } from "./get-proxy";
import { buildPostPayload } from "./post-payload";
import { sendFetch } from "./send-fetch";
import type { ProxyCallerDefaults } from "./types";
import { handleXhrUpload } from "./xhr-handler";

export type { ProxyCallerDefaults } from "./types";

export function createProxyCallerFn<
  TSources extends Record<string, unknown> = Record<string, unknown>,
>(defaults: ProxyCallerDefaults = {}): CallerFn<TSources> {
  const {
    proxyUrl = "/api/request",
    credentials = "include",
    headers: defaultHeaders,
    timeout: defaultTimeout,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  const url = proxyUrl;
  const fetchCtx = { onSuccess: globalOnSuccess, onError: globalOnError };

  const selectSource = (source: string, options?: CallOptions<boolean>) => {
    async function execute(...arguments_: [string] | [string, FormData | Record<string, unknown>]) {
      const [endpoint, variables] = arguments_;
      const { group, method } = parseEndpointKey(endpoint);

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
