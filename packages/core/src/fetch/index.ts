/**
 * Standalone fetch client — lightweight wrapper over native fetch.
 *
 * @example
 * ```ts
 * import { createFetch } from "@noverax/courier/fetch";
 *
 * const api = createFetch({ baseURL: "https://api.example.com" });
 *
 * const users = await api.get<User[]>("/users");
 * const user = await api.post<User>("/users", { json: { name: "Alice" } });
 * ```
 */

import { HTTPError } from "../errors";
import { getResponseData } from "../http-client/response";
import type { ResponseType } from "../http-client/types";
import { coreFetch } from "../utils/fetch";
import type { FetchClient, FetchClientOptions, RequestOptions } from "./types";

export type { FetchClient, FetchClientOptions, RequestOptions, ResponseType } from "./types";

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

function mergeHeaders(
  defaults?: Record<string, string>,
  overrides?: Record<string, string> | Headers,
): Record<string, string> | undefined {
  if (!defaults && !overrides) return undefined;
  const result = { ...defaults };
  if (overrides instanceof Headers) {
    overrides.forEach((value, key) => {
      result[key] = value;
    });
  } else if (overrides) {
    Object.assign(result, overrides);
  }
  return result;
}

/** The body of an error answer, or a stand-in when it cannot be read. */
async function readErrorBody(response: Response, type: ResponseType): Promise<unknown> {
  try {
    return await getResponseData(response, type);
  } catch {
    /* The status is the answer; a body that will not parse only loses the detail. */
    return { message: `HTTP ${response.status}` };
  }
}

async function request<TResponse>(
  method: string,
  url: string,
  defaults: FetchClientOptions,
  options?: RequestOptions,
): Promise<TResponse> {
  const fullUrl = joinUrl(defaults.baseURL ?? "", url);
  const headers = mergeHeaders(defaults.headers, options?.headers);

  const response = await coreFetch(method, fullUrl, {
    json: options?.json,
    body: options?.body,
    searchParams: options?.searchParams,
    timeout: options?.timeout ?? defaults.timeout,
    signal: options?.signal,
    ...(headers && { headers }),
  });

  const type = options?.responseType ?? "json";
  /* Checked before HEAD returns, so a HEAD answered 404 or 401 does not
     resolve as though the resource were there. */
  if (!response.ok) {
    const data = method === "head" ? null : await readErrorBody(response, type);
    throw new HTTPError({ status: response.status, headers: response.headers, data });
  }
  if (method === "head") return response.headers as TResponse;

  /* The same reader as the endpoint client, so an empty 200 or 201 is `null`
     rather than a SyntaxError that no isHTTPError check recognises. */
  return (await getResponseData(response, type)) as TResponse;
}

/**
 * Create a lightweight fetch client with baseURL, default headers, and JSON handling.
 *
 * @param defaults - Default options applied to every request
 * @returns Fetch client with `get`, `post`, `put`, `patch`, `del`, `head` methods
 *
 * @example
 * ```ts
 * const api = createFetch({ baseURL: "https://api.example.com" });
 * const data = await api.get<User[]>("/users");
 * const created = await api.post<User>("/users", { json: { name: "Bob" } });
 * ```
 */
export function createFetch(defaults: FetchClientOptions = {}): FetchClient {
  return {
    get: (url, options) => request("get", url, defaults, options),
    post: (url, options) => request("post", url, defaults, options),
    put: (url, options) => request("put", url, defaults, options),
    patch: (url, options) => request("patch", url, defaults, options),
    del: (url, options) => request("del", url, defaults, options),
    head: (url, options) => request("head", url, defaults, options),
  };
}
