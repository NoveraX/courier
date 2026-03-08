import ky, { HTTPError as KYHTTPError } from "ky";

import { HTTPError } from "./error";
import type { MethodsInstanceOptions, UploadProgress } from "./instance/types";
import type { CommonRequest } from "./types";
import {
  type CreateRequestOptions,
  getRequestOptions,
  isFormData,
  parseQueryRequest,
} from "./utils/helpers";

/**
 * Upload with real network-level progress via XMLHttpRequest.
 * Works on both HTTP/1.1 and HTTP/2, unlike ReadableStream + duplex which requires HTTP/2.
 */
function xhrUpload(
  url: string,
  body: FormData | string,
  options: {
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    timeout?: number;
    signal?: AbortSignal;
    onProgress: (progress: UploadProgress) => void;
  },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    // "include" → always send cookies cross-origin
    // "omit" → never send cookies (even same-origin)
    // "same-origin" (default) → XHR default behavior (withCredentials = false)
    xhr.withCredentials = options.credentials === "include";

    if (options.timeout) {
      xhr.timeout = options.timeout;
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        // Skip content-type for FormData — browser sets it with multipart boundary
        if (!(body instanceof FormData && key.toLowerCase() === "content-type")) {
          xhr.setRequestHeader(key, value);
        }
      }
    }

    if (typeof body === "string") {
      xhr.setRequestHeader("content-type", "application/json");
    }

    const onAbort = () => xhr.abort();
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        options.onProgress({
          percent: event.total > 0 ? event.loaded / event.total : 0,
          transferredBytes: event.loaded,
          totalBytes: event.total,
        });
      }
    });

    xhr.addEventListener("load", () => {
      cleanup();

      const headers = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split("\r\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
        }
      }

      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers,
        }),
      );
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new TypeError("Network request failed"));
    });
    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new TypeError("Request timed out"));
    });

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }

    xhr.send(body);
  });
}

export type ClientRequestDefaults = {
  requestPage?: string;
  timeout?: number;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

export function createClientRequest<T extends Record<string, unknown> = Record<string, unknown>>(
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
        const body = new FormData();

        for (const [key, value] of variables.entries()) {
          body.append(key, value);
        }

        body.append("_source", source);
        body.append("_group", group || "");
        body.append("_query", query);
        body.append("_options", JSON.stringify(serverOptions));

        requestOptions = { body };
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

      let kyPostOptions: Record<string, unknown>;

      if (onUploadProgress) {
        if (process.env.NODE_ENV !== "production") {
          if (cache)
            console.warn(
              "[nexus] 'cache' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
          if (onDownloadProgress)
            console.warn(
              "[nexus] 'onDownloadProgress' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
          if (next)
            console.warn(
              "[nexus] 'next' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
        }

        const body = isFormData(variables)
          ? (requestOptions.body as FormData)
          : JSON.stringify(requestOptions.json);

        try {
          const response = await xhrUpload(`/api/${requestPage}`, body, {
            headers: defaultHeaders,
            credentials,
            timeout: kyOptions.timeout || undefined,
            signal: signal || undefined,
            onProgress: onUploadProgress,
          });

          if (!response.ok) {
            let responseData: unknown;
            try {
              responseData = await response.json();
            } catch {
              responseData = { success: false, message: `HTTP ${response.status}` };
            }

            const { options: parsedOptions } = getRequestOptions(
              requestOptions.body || requestOptions.json,
            );
            const { rawData } = parsedOptions ?? {};

            const errorData =
              rawData &&
              typeof responseData === "object" &&
              responseData !== null &&
              "data" in responseData
                ? (responseData as { data: unknown }).data
                : responseData;

            const httpError = new HTTPError({
              status: response.status,
              headers: response.headers,
              data: errorData,
            });

            throw httpError;
          }

          if (stream) {
            await globalOnSuccess?.(response);
            return response;
          }

          const data = await response.json();
          await globalOnSuccess?.(data);
          return data;
        } catch (error) {
          if (error instanceof HTTPError) {
            await globalOnError?.(error);
            throw error;
          }
          throw error;
        }
      }

      kyPostOptions = {
        ...requestOptions,
        credentials,
        cache,
        onDownloadProgress,
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
