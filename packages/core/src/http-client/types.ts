import type { ProxyBoundary } from "../define/boundary-types";
import type { Middleware } from "../middleware/types";
import type { ProxyPath } from "../proxy-caller/proxy-path";

export type HttpMethod = "get" | "post" | "put" | "patch" | "del" | "head" | "options";

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
  variables?: unknown;
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
  : [url?: string, variables?: unknown, options?: MethodOptions<TMethod>];

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
  /** Required by `fetch` when `body` is a ReadableStream */
  duplex?: "half";
  /** Called as the answer's body is read */
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Called as the request's body is sent */
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type OptionsWithSearchParams = Omit<FetchOptions, "searchParams"> & {
  searchParams?: Record<string, unknown>;
};

export type SimpleOptions = Omit<OptionsWithSearchParams, "body" | "json" | "searchParams">;

/**
 * Options a wire call takes. A GET, HEAD or OPTIONS has no body to name; a DELETE may
 * carry one, as some APIs require.
 */
export type MethodOptions<TMethod extends HttpMethod> = TMethod extends "get" | "head" | "options"
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
    /** Defaults under an object body, or query values on a read or DELETE; a list or raw body is sent alone */
    defaultBody?: Record<string, unknown>;
    /** Default query params merged into every request URL */
    defaultQueryParams?: Record<string, unknown>;
    /**
     * Headers carried across the proxy for every endpoint of this source, both
     * ways: forwarded from the caller to the upstream, and passed back from
     * the upstream's answer (e.g. ["X-Custom", "X-Total-Count"]). The body's
     * own description and `Set-Cookie` are never taken from this list.
     */
    allowedHeaders?: string[];
    /**
     * Whether the browser may call this source through the proxy — defaults
     * to true. Set false for a source only server code should reach, and
     * re-open individual groups with their own `expose`.
     */
    expose?: boolean;
    /**
     * The endpoints a browser may call, named one by one, from
     * `defineBoundary`. The proxy refuses every other endpoint of this source
     * over HTTP, streams and sockets alike; it takes precedence over `expose`.
     * The boundary is typed against this API, so annotate it as
     * `ProxyBoundary` where it is declared, or TypeScript infers each of the
     * two from the other and gives up on both.
     */
    boundary?: ProxyBoundary;
    /** Custom serializer for variables that are an object, replacing JSON.stringify (e.g. for XML) */
    bodySerializer?: (data: Record<string, unknown>) => BodyInit;
    /** Custom search params serializer with stringify/parse methods */
    searchParamsSerializer?: SearchParamsSerializer;
    /** Cancel an in-flight read when the same endpoint is read again — defaults to false */
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
  /** A direct caller's default timeout, for a call and an endpoint that name none */
  defaultTimeout?: number;
};
