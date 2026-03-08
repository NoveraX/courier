import ky, { HTTPError as KYHTTPError } from "ky";

import { HTTPError } from "./error";
import type { MethodsInstanceOptions } from "./instance/types";
import type { CommonRequest, QueryOverrides } from "./types";
import {
  type CreateRequestOptions,
  getRequestOptions,
  isFormData,
  parseQueryRequest,
} from "./utils/helpers";

export type ClientRequestDefaults = {
  requestPage?: string;
  timeout?: number;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

export function createClientRequest<T extends Record<string, unknown> = QueryOverrides>(
  defaults: ClientRequestDefaults = {},
): CommonRequest<T> {
  const {
    requestPage = process.env.NEXT_PUBLIC_REQUEST_PAGE || "request",
    credentials = "include",
    headers: defaultHeaders,
    timeout: defaultTimeout,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  return ((source: string, options?: MethodsInstanceOptions<boolean>) =>
    async (...arguments_: [string] | [string, FormData | Record<string, unknown>]) => {
      const [queryRequest, variables] = arguments_;
      const { group, query } = parseQueryRequest(queryRequest);

      const { cache, onDownloadProgress, onUploadProgress, next, signal, stream, ...kyOptions } =
        options || {};

      if (kyOptions.timeout === undefined && defaultTimeout !== undefined) {
        kyOptions.timeout = defaultTimeout;
      }

      let requestOptions:
        | { body: FormData; json?: undefined }
        | { json: Partial<CreateRequestOptions>; body?: undefined };

      const serverOptions = stream ? { ...kyOptions, stream } : kyOptions;

      if (isFormData(variables)) {
        variables.append("_source", source);
        variables.append("_group", group || "");
        variables.append("_query", query);
        variables.append("_options", JSON.stringify(serverOptions));

        requestOptions = { body: variables };
      } else {
        requestOptions = {
          json: {
            source,
            group,
            query,
            variables,
            options: serverOptions,
          },
        };
      }

      const kyPostOptions = {
        ...requestOptions,
        credentials,
        cache,
        onDownloadProgress,
        onUploadProgress,
        next,
        signal,
        timeout: kyOptions.timeout,
        headers: defaultHeaders,
      };

      try {
        if (stream) {
          const response = await ky.post(`/api/${requestPage}`, kyPostOptions);
          await globalOnSuccess?.(response);
          return response;
        }

        const response = await ky.post(`/api/${requestPage}`, kyPostOptions).json();
        await globalOnSuccess?.(response);
        return response;
      } catch (error) {
        if (error instanceof KYHTTPError) {
          let httpError: HTTPError;

          if (stream) {
            httpError = new HTTPError({
              status: error.response.status,
              headers: error.response.headers,
              data: { success: false, message: `HTTP ${error.response.status}` },
            });
          } else {
            const response = await error.response.json();

            const { options } = getRequestOptions(requestOptions.body || requestOptions.json);
            const { rawData } =
              typeof options === "object" ? (options as Record<string, unknown>) : {};

            const responseResult = rawData
              ? {
                  ...response,
                  status: error.response.status,
                  headers: error.response.headers,
                }
              : {
                  status: error.response.status,
                  headers: error.response.headers,
                  data: response,
                };

            httpError = new HTTPError(responseResult);
          }

          await globalOnError?.(httpError);
          throw httpError;
        }

        throw error;
      }
    }) as CommonRequest<T>;
}
