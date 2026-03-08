import HTTPError from "../error";
import type { Context } from "../instance/types";
import type { CommonRequest } from "../types";
import createRequest from "../utils/createRequest";
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

  return ((source: any, options?: any) =>
    async (...arguments_: any[]) => {
      const queryArguments = arguments_ as
        | [string, Context]
        | [string, Record<string, any>, Context];

      const [queryRequest] = queryArguments;
      const { group, query } = parseQueryRequest(queryRequest);

      const variables = isContext(queryArguments[1]) ? undefined : queryArguments[1];

      const mergedOptions = { ...options };

      if (mergedOptions.timeout === undefined && defaultTimeout !== undefined) {
        mergedOptions.timeout = defaultTimeout;
      }

      if (defaultHeaders) {
        mergedOptions.headers = options?.headers
          ? {
              ...defaultHeaders,
              ...Object.fromEntries(new Headers(options.headers as HeadersInit)),
            }
          : defaultHeaders;
      }

      const requestOptions = {
        source: source as string,
        group,
        query,
        variables,
        options: mergedOptions,
      };

      const context = (
        queryArguments.length > 2 ? queryArguments[2] : queryArguments[1]
      ) as Context;

      try {
        const result = await createRequest(sources, requestOptions, context);
        await globalOnSuccess?.(result);
        return result as any;
      } catch (error) {
        if (error instanceof HTTPError) {
          await globalOnError?.(error);
        }
        throw error;
      }
    }) as CommonRequest<T, true>;
}

export default createDirectRequest;
