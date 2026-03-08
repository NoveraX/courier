import { HTTPError } from "../error";
import type { Context, MethodsInstanceOptions } from "../instance/types";
import type { CommonRequest } from "../types";
import { createRequest } from "../utils/createRequest";
import { parseQueryRequest } from "../utils/helpers";

import type { Sources } from "./types";

export type DirectRequestDefaults = {
  timeout?: number;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

const isContext = (value: unknown): value is Context =>
  typeof value === "object" &&
  value !== null &&
  (("req" in value && value.req instanceof Request) ||
    ("res" in value && value.res instanceof Response) ||
    ("headers" in value && value.headers instanceof Headers));

export function createDirectRequest<T extends Sources>(
  sources: T,
  defaults: DirectRequestDefaults = {},
): CommonRequest<T, true> {
  const {
    timeout: defaultTimeout,
    headers: defaultHeaders,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  return ((source: string, options?: MethodsInstanceOptions<boolean>) =>
    async (...arguments_: [string, Context] | [string, Record<string, unknown>, Context]) => {
      const [queryRequest] = arguments_;
      const { group, query } = parseQueryRequest(queryRequest);

      const variables = isContext(arguments_[1]) ? undefined : arguments_[1];

      const mergedOptions: Record<string, unknown> = { ...options };

      if (mergedOptions.timeout === undefined && defaultTimeout !== undefined) {
        mergedOptions.timeout = defaultTimeout;
      }

      if (defaultHeaders) {
        mergedOptions.headers = options?.headers
          ? {
              ...defaultHeaders,
              ...Object.fromEntries(new Headers(options.headers as HeadersInit)), // ky KyHeadersInit → DOM HeadersInit bridge
            }
          : defaultHeaders;
      }

      const requestOptions = {
        source,
        group,
        query,
        variables,
        options: mergedOptions,
      };

      const contextArg = arguments_.length > 2 ? arguments_[2] : arguments_[1];
      const context = isContext(contextArg) ? contextArg : undefined;

      try {
        const result = await createRequest(sources, requestOptions, context);
        await globalOnSuccess?.(result);
        return result;
      } catch (error) {
        if (error instanceof HTTPError) {
          await globalOnError?.(error);
        }
        throw error;
      }
    }) as CommonRequest<T, true>; // TS cannot infer curried generic closures
}
