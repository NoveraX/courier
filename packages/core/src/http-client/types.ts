import type { Middleware } from "../middleware/types";

export type HttpMethod = "get" | "post" | "put" | "patch" | "del" | "head";

export type AnyEndpoints = Partial<{
  [k: string]: (
    methods: HttpMethods,
    variables: unknown,
  ) => Promise<HttpResponse<unknown>> | HttpResponse<unknown>;
}>;

export type HttpMethods = {
  [TMethod in HttpMethod]: <TData = unknown>(
    ...arguments_: MethodParameters<TMethod>
  ) => Promise<HttpResponse<TData>>;
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

export type CallOptions<TRaw extends boolean = false> = Omit<
  SimpleOptions,
  "onUploadProgress" | "method"
> & {
  rawData?: TRaw;
  forwardVariables?: boolean;
  stream?: boolean;
  /** Proxy HTTP method: "GET" for cacheable reads, "POST" (default) for mutations */
  method?: "GET" | "POST";
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type HttpResponse<TData = unknown> = {
  status: number;
  headers: Headers;
  data: TData;
};

export type MethodParameters<TMethod extends HttpMethod> = TMethod extends "head"
  ? [url?: string, options?: MethodOptions<TMethod>]
  : [url?: string, variables?: FormData | object, options?: MethodOptions<TMethod>];

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

export type MethodOptions<TMethod extends HttpMethod> = TMethod extends "del" | "get" | "head"
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
    middleware?: Middleware[];
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
  /** High-resolution timestamp when the proxy adapter received the request (performance.now()) */
  proxyReceiveAt?: number;
};
