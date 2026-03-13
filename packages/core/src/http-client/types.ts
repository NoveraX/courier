import type { MiddlewareFn } from "../middleware/types";

export type HttpMethod = "get" | "post" | "put" | "patch" | "del" | "head";

export type AnyEndpoints = Partial<{
  [k: string]: (
    methods: HttpMethods,
    variables: unknown,
  ) => Promise<HttpResponse<unknown>> | HttpResponse<unknown>;
}>;

export type HttpMethods = {
  [K in HttpMethod]: <T = unknown>(...arguments_: MethodParameters<K>) => Promise<HttpResponse<T>>;
};

export type BoundMethodOptions = SimpleOptions & {
  variables?: FormData | object;
  stream?: boolean;
};

export type UploadProgress = {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
};

export type DownloadProgress = {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
};

export type CallOptions<R extends boolean = false> = Omit<
  SimpleOptions,
  "onUploadProgress" | "method"
> & {
  rawData?: R;
  forwardVariables?: boolean;
  stream?: boolean;
  /** Proxy HTTP method: "GET" for cacheable reads, "POST" (default) for mutations */
  method?: "GET" | "POST";
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type HttpResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
};

export type MethodParameters<T extends HttpMethod> = T extends "head"
  ? [url?: string, options?: MethodOptions<T>]
  : [url?: string, variables?: FormData | object, options?: MethodOptions<T>];

/** Core fetch options — extends standard RequestInit with convenience properties */
export type FetchOptions = Omit<RequestInit, "method"> & {
  json?: unknown;
  searchParams?: string | URLSearchParams | Record<string, string>;
  timeout?: number;
  prefixUrl?: string;
  onDownloadProgress?: (progress: DownloadProgress) => void;
};

export type OptionsWithSearchParams = Omit<FetchOptions, "searchParams"> & {
  searchParams?: Record<string, unknown>;
};

export type SimpleOptions = Omit<OptionsWithSearchParams, "body" | "json" | "searchParams">;

export type MethodOptions<T extends HttpMethod> = T extends "del" | "get" | "head"
  ? SimpleOptions
  : OptionsWithSearchParams;

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "formData";

export type SearchParamsSerializer = {
  stringify: (obj: Record<string, unknown>) => string;
  parse: (str: string) => Record<string, unknown>;
};

export type BaseOptions = MergeOptions &
  Omit<FetchOptions, "body" | "json" | "prefixUrl" | "searchParams"> & {
    baseURL?: string;
    responseType?: ResponseType;
    responseParser?: (response: Response) => Promise<unknown>;
    defaultBody?: Record<string, unknown>;
    defaultQueryParams?: Record<string, unknown>;
    allowedHeaders?: string[];
    bodySerializer?: (data: Record<string, unknown>) => BodyInit;
    searchParamsSerializer?: SearchParamsSerializer;
    deduplicate?: boolean;
    middleware?: MiddlewareFn[];
  };

export type MergeOptions = {
  pathOptions?: PathOptions;
};

export type GroupOptions = MergeOptions & {
  prefix?: string;
};

export type PathOptions = (request?: Request) => PathOptionsResult | Promise<PathOptionsResult>;

type PathOptionsResult = Record<string, boolean | number | string | null | undefined> | undefined;

export type Context = {
  req?: Request;
  res?: Response;
  headers?: Headers;
  /** HTTP method of the proxy request (set by apiRoute) */
  proxyMethod?: "GET" | "POST";
  /** Override mode for devtools events (e.g. playground replay preserving original mode) */
  mode?: "direct" | "proxy";
};
