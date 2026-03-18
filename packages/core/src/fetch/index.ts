/**
 * Standalone fetch client — lightweight wrapper over native fetch.
 *
 * @example
 * ```ts
 * import { createFetch } from "@noverax/nexus/fetch";
 *
 * const api = createFetch({ baseURL: "https://api.example.com" });
 *
 * const users = await api.get<User[]>("/users");
 * const user = await api.post<User>("/users", { json: { name: "Alice" } });
 * ```
 */

import { HTTPError } from "../error";
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

async function parseResponse(response: Response, type?: string): Promise<unknown> {
  if (response.status === 204) return null;
  switch (type) {
    case "text":
      return response.text();
    case "blob":
      return response.blob();
    case "arrayBuffer":
      return response.arrayBuffer();
    case "formData":
      return response.formData();
    default:
      return response.json();
  }
}

async function request<T>(
  method: string,
  url: string,
  defaults: FetchClientOptions,
  options?: RequestOptions,
): Promise<T> {
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

  if (method === "head") return response.headers as T;

  if (!response.ok) {
    let data: unknown;
    try {
      data = await parseResponse(response, options?.responseType);
    } catch {
      data = { message: `HTTP ${response.status}` };
    }
    throw new HTTPError({ status: response.status, headers: response.headers, data });
  }

  return (await parseResponse(response, options?.responseType)) as T;
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
