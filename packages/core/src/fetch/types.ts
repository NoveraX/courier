import type { WebBody } from "../http-client/web-types";

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "formData";

export type FetchClientOptions = {
  baseURL?: string | undefined;
  headers?: Record<string, string> | undefined;
  timeout?: number | undefined;
};

export type RequestOptions = {
  json?: unknown;
  body?: WebBody | undefined;
  searchParams?: Record<string, string> | URLSearchParams | string | undefined;
  headers?: Record<string, string> | Headers | undefined;
  timeout?: number | undefined;
  signal?: AbortSignal | undefined;
  responseType?: ResponseType | undefined;
};

type RequestFn = <TResponse = unknown>(url: string, options?: RequestOptions) => Promise<TResponse>;

export type FetchClient = {
  get: RequestFn;
  post: RequestFn;
  put: RequestFn;
  patch: RequestFn;
  del: RequestFn;
  head: (url: string, options?: RequestOptions) => Promise<Headers>;
  /** A read that asks its question in the body, sent as `json` or `body`. */
  query: RequestFn;
};
