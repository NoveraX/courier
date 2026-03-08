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
    requestPage = (process.env.NEXT_PUBLIC_REQUEST_PAGE || "request").replace(
      /[^a-zA-Z0-9_\-/]/g,
      "",
    ),
    credentials = "include",
    headers: defaultHeaders,
    timeout: defaultTimeout,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  const selectSource = (source: string, options?: MethodsInstanceOptions<boolean>) => {
    async function executeQuery(
      ...arguments_: [string] | [string, FormData | Record<string, unknown>]
    ) {
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
            let response: unknown;

            try {
              response = await error.response.json();
            } catch {
              response = await error.response.text().catch(() => error.message);
            }

            const { options } = getRequestOptions(requestOptions.body || requestOptions.json);
            const { rawData } = options ?? {};

            const errorData =
              rawData && typeof response === "object" && response !== null && "data" in response
                ? (response as { data: unknown }).data
                : response;

            const responseResult = {
              status: error.response.status,
              headers: error.response.headers,
              data: errorData,
            };

            httpError = new HTTPError(responseResult);
          }

          await globalOnError?.(httpError);
          throw httpError;
        }

        throw error;
      }
    }
    return executeQuery;
  };
  return selectSource as unknown as CommonRequest<T>; // TS cannot infer curried generic closures
}
