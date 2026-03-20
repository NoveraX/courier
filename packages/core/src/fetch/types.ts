export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "formData";

export type FetchClientOptions = {
  baseURL?: string;
  headers?: Record<string, string>;
  timeout?: number;
};

export type RequestOptions = {
  json?: unknown;
  body?: BodyInit;
  searchParams?: Record<string, string> | URLSearchParams | string;
  headers?: Record<string, string> | Headers;
  timeout?: number;
  signal?: AbortSignal;
  responseType?: ResponseType;
};

type RequestFn = <TResponse = unknown>(url: string, options?: RequestOptions) => Promise<TResponse>;

export type FetchClient = {
  get: RequestFn;
  post: RequestFn;
  put: RequestFn;
  patch: RequestFn;
  del: RequestFn;
  head: (url: string, options?: RequestOptions) => Promise<Headers>;
};
