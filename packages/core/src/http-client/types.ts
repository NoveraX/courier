import type { Middleware } from "../middleware/types";
import type { ProxyPath } from "../proxy-caller/proxy-path";

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
  /** JSON body — automatically serialized and sets Content-Type header */
  json?: unknown;
  /** URL search parameters appended to the request URL */
  searchParams?: string | URLSearchParams | Record<string, string>;
  /** Request timeout in milliseconds — aborts if exceeded */
  timeout?: number;
  /** URL prefix prepended to the request path */
  prefixUrl?: string;
  /** Callback for tracking download progress (streamed responses) */
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
    /** Base URL for all requests (e.g. "https://api.example.com/v1") */
    baseURL?: string;
    /** Response body parsing strategy — defaults to "json" */
    responseType?: ResponseType;
    /** Custom response parser replacing the built-in one (receives raw Response) */
    responseParser?: (response: Response) => Promise<unknown>;
    /** Default body fields merged into every request body */
    defaultBody?: Record<string, unknown>;
    /** Default query params merged into every request URL */
    defaultQueryParams?: Record<string, unknown>;
    /** Whitelist of headers forwarded through the proxy (e.g. ["Authorization", "X-Custom"]) */
    allowedHeaders?: string[];
    /**
     * Whether the browser may call this source through the proxy — defaults
     * to true. Set false for a source only server code should reach, and
     * re-open individual groups with their own `expose`.
     */
    expose?: boolean;
    /**
     * The endpoints a browser may call, named one by one. Takes precedence
     * over `expose`; see `defineBoundary`.
     */
    boundary?: { source: string; endpoints: Readonly<Record<string, unknown>> };
    /** Custom body serializer replacing JSON.stringify (e.g. for FormData or XML) */
    bodySerializer?: (data: Record<string, unknown>) => BodyInit;
    /** Custom search params serializer with stringify/parse methods */
    searchParamsSerializer?: SearchParamsSerializer;
    /** Deduplicate identical in-flight GET requests — defaults to false */
    deduplicate?: boolean;
    /** Middleware pipeline applied to every request in order */
    middleware?: Middleware[];
    /**
     * Proxy endpoint paths for HTTP / SSE / WS transports. Carried as
     * deployment metadata on the source so Studio and `createProxyCaller`
     * can resolve concrete URLs without hard-coded conventions. Each
     * field accepts either a relative path (resolved against the runtime
     * origin) or an absolute URL. See `ProxyPath` for the per-transport
     * defaults and the rationale for the WS field having no default.
     */
    proxyPath?: ProxyPath;
  };

export type MergeOptions = {
  /** Dynamic path parameters resolved at request time (e.g. from cookies or headers) */
  pathOptions?: PathOptions;
};

export type GroupOptions = MergeOptions & {
  /** URL prefix prepended to all endpoint paths in this group (e.g. "users" → "/users/:path") */
  prefix?: string;
  /**
   * Whether the browser may call this group through the proxy. Overrides the
   * source's own setting; unset means the source decides.
   */
  expose?: boolean;
};

export type PathOptions = (request?: Request) => PathOptionsResult | Promise<PathOptionsResult>;

type PathOptionsResult = Record<string, boolean | number | string | null | undefined> | undefined;

/**
 * Public request context — passed by users via createCaller defaults or per-call.
 * Carries the original Request/Response and forwarded headers for SSR scenarios
 * (cookie propagation, header forwarding, etc.).
 */
export type RequestContext = {
  req?: Request;
  res?: Response;
  headers?: Headers;
};

/**
 * Internal execution context — extends RequestContext with adapter-only metadata.
 * Set by framework adapters (apiRoute, sseRoute, ws handler) and read by
 * executeRequest, middleware, and studio instrumentation. Not part of the
 * public API for direct callers.
 */
export type Context = RequestContext & {
  /** HTTP method of the proxy request (set by apiRoute) */
  proxyMethod?: "GET" | "POST";
  /** Override mode for studio events (e.g. playground replay preserving original mode) */
  mode?: "direct" | "proxy";
  /** High-resolution timestamp when the proxy adapter received the request (performance.now()) */
  proxyReceiveAt?: number;
};
