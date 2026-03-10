import { buildClientProxy, type ExecuteBackend, type TypedClient } from "./client";
import type { DefinedApi } from "./define/types";
import { HTTPError } from "./error";
import type { CallOptions, UploadProgress } from "./http-client/types";
import type { CallerFn } from "./types";
import type { CoreFetchInit } from "./utils/fetch";
import { coreFetch } from "./utils/fetch";
import {
  isFormData,
  parseEndpointKey,
  parseRequestPayload,
  type RequestPayload,
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

export type ProxyCallerDefaults = {
  /** Full URL path to the proxy endpoint (default: "/api/request") */
  proxyUrl?: string;
  timeout?: number;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

function buildHttpError(
  status: number,
  headers: Headers,
  responseData: unknown,
  requestPayload: { body?: FormData; json?: Partial<RequestPayload> },
): HTTPError {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  const { rawData } = options ?? {};

  const data =
    rawData && typeof responseData === "object" && responseData !== null && "data" in responseData
      ? (responseData as { data: unknown }).data
      : responseData;

  return new HTTPError({ status, headers, data });
}

async function readErrorResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { success: false, message: `HTTP ${response.status}` };
  }
}

async function sendFetch(
  method: "get" | "post",
  url: string,
  options: Record<string, unknown>,
  ctx: {
    stream: boolean;
    requestPayload: { body?: FormData; json?: Partial<RequestPayload> };
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: HTTPError) => void | Promise<void>;
  },
): Promise<unknown> {
  const { onDownloadProgress: _dp, ...fetchOptions } = options;

  try {
    const response = await coreFetch(method, url, fetchOptions as CoreFetchInit);

    if (!response.ok) {
      const responseData = await readErrorResponse(response);
      const httpError = buildHttpError(
        response.status,
        response.headers,
        responseData,
        ctx.requestPayload,
      );
      await ctx.onError?.(httpError);
      throw httpError;
    }

    if (ctx.stream) {
      await ctx.onSuccess?.(response);
      return response;
    }

    const data = await response.json();
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw error;
  }
}

// ── Internal CallerFn-style executor (used by @noverax/nexus-query) ──────────

export function createProxyCallerFn<T extends Record<string, unknown> = Record<string, unknown>>(
  defaults: ProxyCallerDefaults = {},
): CallerFn<T> {
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

      // Next.js augments RequestInit with a `next` property for caching (revalidate, tags).
      // Extract it from raw options so it flows through to fetch() without core depending on Next.js types.
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

      // GET proxy: encode everything as query params
      if (proxyMethod === "GET" && !isFormData(variables) && !onUploadProgress) {
        const searchParams: Record<string, string> = { _s: source, _m: method };
        if (group) searchParams._g = group;

        if (variables && typeof variables === "object") {
          for (const [k, v] of Object.entries(variables)) {
            if (v !== undefined && v !== null) searchParams[k] = String(v);
          }
        }

        const serverOptionsStr = JSON.stringify(serverOptions);
        if (serverOptionsStr !== "{}") {
          searchParams._o = serverOptionsStr;
        }

        return sendFetch(
          "get",
          url,
          {
            searchParams,
            credentials,
            headers: defaultHeaders,
            signal,
            timeout: extraOptions.timeout,
            cache,
            next,
            onDownloadProgress,
          },
          {
            ...fetchCtx,
            stream: !!stream,
            requestPayload: { json: { source, group, method, variables } },
          },
        );
      }

      // POST proxy: build JSON or FormData payload
      let requestPayload:
        | { body: FormData; json?: undefined }
        | { json: Partial<RequestPayload>; body?: undefined };

      if (isFormData(variables)) {
        const body = new FormData();

        for (const [key, value] of variables.entries()) {
          body.append(key, value);
        }

        body.append("_source", source);
        body.append("_group", group || "");
        body.append("_method", method);
        body.append("_options", JSON.stringify(serverOptions));

        requestPayload = { body };
      } else {
        requestPayload = {
          json: {
            source,
            group,
            method,
            variables,
            options: serverOptions,
          },
        };
      }

      // XHR upload path (real network-level progress)
      if (onUploadProgress) {
        if (process.env.NODE_ENV !== "production") {
          if (cache)
            console.warn(
              "[nexus] 'cache' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
          if (next)
            console.warn(
              "[nexus] 'next' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
          if (onDownloadProgress)
            console.warn(
              "[nexus] 'onDownloadProgress' option is ignored when 'onUploadProgress' is set (XHR transport)",
            );
        }

        const body = isFormData(variables)
          ? (requestPayload.body as FormData)
          : JSON.stringify(requestPayload.json);

        try {
          const response = await xhrUpload(url, body, {
            headers: defaultHeaders,
            credentials,
            timeout: extraOptions.timeout || undefined,
            signal: signal || undefined,
            onProgress: onUploadProgress,
          });

          if (!response.ok) {
            const responseData = await readErrorResponse(response);
            throw buildHttpError(response.status, response.headers, responseData, requestPayload);
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

      // POST via fetch
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
  // TypeScript cannot infer curried generic closures; cast verified by type tests
  return selectSource as unknown as CallerFn<T>;
}

// ── Public API: Proxy client with dot notation ───────────────────────────────

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
