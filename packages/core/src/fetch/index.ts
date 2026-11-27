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
import { assertReadable, getResponseData } from "../http-client/response";
import type { ResponseType } from "../http-client/types";
import type { Answer } from "../utils/answer";
import { cancellation } from "../utils/cancellation";
import { defineOwn } from "../utils/define-own";
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
    for (const [key, value] of overrides.entries()) defineOwn(result, key, value);
  } else if (overrides) {
    for (const [key, value] of Object.entries(overrides)) defineOwn(result, key, value);
  }
  return result;
}

/** The body of an error answer, or a stand-in when it cannot be read. */
async function readErrorBody(answer: Answer, type: ResponseType): Promise<unknown> {
  try {
    return await getResponseData(answer, type);
  } catch {
    /* The status is the answer; a body that will not parse only loses the detail. */
    return { message: `HTTP ${answer.response.status}` };
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
  const signal = options?.signal;

  const answer = await coreFetch(method, fullUrl, {
    json: options?.json,
    body: options?.body,
    searchParams: options?.searchParams,
    timeout: options?.timeout ?? defaults.timeout,
    signal,
    ...(headers && { headers }),
  });
  try {
    return await answerOf<TResponse>(method, answer, options?.responseType ?? "json");
  } catch (error) {
    /* A cancellation that lands while the answer is read stops the read with the caller's
       reason, which the reader reports as a body it could not parse: it is the cancellation. */
    if (signal?.aborted) throw cancellation(signal);
    throw error;
  }
}

/* What the request resolves to, read from its answer, or the HTTPError the answer is. */
async function answerOf<TResponse>(
  method: string,
  answer: Answer,
  type: ResponseType,
): Promise<TResponse> {
  const { response } = answer;
  assertReadable(response);
  /* Checked before HEAD returns, so a HEAD answered 404 or 401 does not
     resolve as though the resource were there. */
  if (!response.ok) {
    const data = method === "head" ? null : await readErrorBody(answer, type);
    throw new HTTPError({ status: response.status, headers: response.headers, data });
  }
  if (method === "head") return response.headers as TResponse;

  /* The same reader as the endpoint client, so an empty 200 or 201 is `null`
     rather than a SyntaxError that no isHTTPError check recognises. */
  return (await getResponseData(answer, type)) as TResponse;
}

/**
 * Create a lightweight fetch client with baseURL, default headers, and JSON handling.
 *
 * A request cancelled through its `signal` rejects with an `AbortError`, the
 * reason it was given as its cause, whether the answer has come or its body
 * is still arriving.
 *
 * @param defaults - Default options applied to every request
 * @returns Fetch client with `get`, `post`, `put`, `patch`, `del`, `head` and `query` methods
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
    query: (url, options) => request("query", url, defaults, options),
  };
}
