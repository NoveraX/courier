import type { AgentCall } from "../agent/types";
import type { Middleware } from "../middleware/types";
import type { ProxyPath } from "../proxy-caller/proxy-path";
import type { IncomingRequest } from "../session/incoming-request";
import type { ForwardOptions, SessionOptions } from "../session/types";
import type { TransportOptions } from "./transport-options";
import type { WebBody } from "./web-types";

export type HttpMethod = "get" | "post" | "put" | "patch" | "del" | "head" | "options" | "query";

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

/**
 * A call's options, as `.with()` gives them. Its `fetch`, `webSocket` and
 * `dispatcher` say how this call alone reaches its server, over its group's
 * and its source's; a call through the proxy is sent by the server, with
 * theirs, and is refused them.
 */
export type CallOptions<TRaw extends boolean = false> = Omit<
  SimpleOptions,
  "onUploadProgress" | "method" | "dispatcher"
> &
  TransportOptions & {
    rawData?: TRaw | undefined;
    forwardVariables?: boolean | undefined;
    stream?: boolean | undefined;
    /**
     * The verb the call goes to the proxy with. A read goes as GET, so its
     * answer can be cached, and a write as POST; "POST" keeps a read's
     * variables out of the address.
     */
    method?: "GET" | "POST" | undefined;
    onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
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
export type FetchOptions = Omit<RequestInit, "method" | "body" | "signal"> & {
  /** What the request sends; absent, nothing unless `json` is given. */
  body?: WebBody | null | undefined;
  /** Aborts the request when it fires. */
  signal?: AbortSignal | null | undefined;
  /** JSON body — automatically serialized and sets Content-Type header */
  json?: unknown;
  /** URL search parameters appended to the request URL */
  searchParams?: string | URLSearchParams | Record<string, string> | undefined;
  /** Request timeout in milliseconds — aborts if exceeded */
  timeout?: number | undefined;
  /** URL prefix prepended to the request path */
  prefixUrl?: string | undefined;
  /** Required by `fetch` when `body` is a ReadableStream */
  duplex?: "half" | undefined;
  /** Called as the answer's body is read */
  onDownloadProgress?: ((progress: DownloadProgress) => void) | undefined;
  /** Called as the request's body is sent */
  onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
  /**
   * How this call's successful answer is read — text, a blob, bytes, a form —
   * when it is not what the source reads every answer as. An error answer is
   * read as the source reads it, since it explains the error in its own form.
   */
  responseType?: ResponseType | undefined;
  /**
   * Follow redirects only while they stay on the request's origin, so the
   * credentials a call carries never reach a host the API sent it on to. A
   * call carrying the user's session, or made through the proxy, always
   * does; a browser follows redirects itself and ignores it.
   */
  withinOrigin?: boolean | undefined;
  /**
   * Share the answer of an identical read already in flight — the same
   * method, address, headers and body, every credential among them — rather
   * than send another: the default. `false` sends this call alone.
   */
  coalesce?: boolean | undefined;
};

export type OptionsWithSearchParams = Omit<FetchOptions, "searchParams"> & {
  searchParams?: Record<string, unknown> | undefined;
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

/**
 * A source's options: how its requests are built and read, and — through
 * its `fetch`, `webSocket` and `dispatcher` — how they reach its server,
 * unless a group or a call says otherwise.
 */
export type BaseOptions = MergeOptions &
  Omit<FetchOptions, "body" | "json" | "prefixUrl" | "searchParams" | "dispatcher"> &
  TransportOptions & {
    /** Base URL for all requests (e.g. "https://api.example.com/v1") */
    baseURL?: string | undefined;
    /** Response body parsing strategy — defaults to "json" */
    responseType?: ResponseType | undefined;
    /** Custom response parser replacing the built-in one (receives raw Response) */
    responseParser?: ((response: Response) => Promise<unknown>) | undefined;
    /** Defaults under an object body, or query values on a read or DELETE; a list or raw body is sent alone */
    defaultBody?: Record<string, unknown> | undefined;
    /** Default query params merged into every request URL */
    defaultQueryParams?: Record<string, unknown> | undefined;
    /**
     * Headers carried across the proxy for every endpoint of this source, both
     * ways: forwarded from the caller to the upstream, and passed back from
     * the upstream's answer (e.g. ["X-Custom", "X-Total-Count"]). Cookies
     * cross only where named: `"cookie"` sends the caller's cookies to the
     * upstream, `"set-cookie"` passes the upstream's back. The body's own
     * description is never taken from this list.
     */
    allowedHeaders?: string[] | undefined;
    /**
     * Whether a page may call this source's endpoints through the proxy —
     * none, unless something marks them. `true` opens every endpoint the
     * source holds; a group's own `expose`, or an endpoint's `.expose()`,
     * says otherwise for what it holds, the nearest mark deciding. The
     * routes module Studio writes names every endpoint a mark opens.
     */
    expose?: boolean | undefined;
    /** Custom serializer for variables that are an object, replacing JSON.stringify (e.g. for XML) */
    bodySerializer?: ((data: Record<string, unknown>) => WebBody) | undefined;
    /** Custom search params serializer with stringify/parse methods */
    searchParamsSerializer?: SearchParamsSerializer | undefined;
    /**
     * The reads a newer call cancels while they are still in flight — a
     * search as the user types — by their paths, such as `users.search`.
     * Whatever variables the older call had, it rejects with an `HTTPError`
     * of status 499. It runs where one user is: in a browser or an app.
     */
    cancelPrevious?: readonly string[] | undefined;
    /** Middleware pipeline applied to every request in order */
    middleware?: Middleware[] | undefined;
    /**
     * How the API keeps the user's session: the cookies it is kept in, a
     * cookie holding a bearer token, a double-submit token for writes. A
     * call made while a server serves a user carries it from the request
     * being served, and a call made in a browser lets the browser send its
     * own cookies.
     */
    session?: SessionOptions | undefined;
    /**
     * The headers a call made while serving a request carries from it — the
     * request's id, its trace, the user's address, browser and languages.
     */
    forward?: ForwardOptions | undefined;
    /**
     * Where the app serves its proxy routes for HTTP / SSE / WS, for Studio:
     * its Playground sends a call through them as a page would. A page's
     * proxy client is given its own, in its options. Each field accepts
     * either a relative path (resolved against the runtime origin) or an
     * absolute URL. See `ProxyPath` for the per-transport defaults and the
     * rationale for the WS field having no default.
     */
    proxyPath?: ProxyPath | undefined;
  };

export type MergeOptions = {
  /** Dynamic path parameters resolved at request time (e.g. from cookies or headers) */
  pathOptions?: PathOptions | undefined;
};

/**
 * A group's options: its prefix and path options, whether the browser may
 * call it, and — with its `fetch`, `webSocket` and `dispatcher` — how its
 * endpoints, and those of the groups inside it, reach their server: a
 * client certificate or a proxy for this group alone. A group inside it
 * that sets its own takes its own.
 */
export type GroupOptions = MergeOptions &
  TransportOptions & {
    /** URL prefix prepended to all endpoint paths in this group (e.g. "users" → "/users/:path") */
    prefix?: string | undefined;
    /**
     * Whether the browser may call this group through the proxy. Overrides the
     * source's own setting; unset means the source decides.
     */
    expose?: boolean | undefined;
  };

export type PathOptions = (request?: Request) => PathOptionsResult | Promise<PathOptionsResult>;

type PathOptionsResult = Record<string, boolean | number | string | null | undefined> | undefined;

/**
 * Public request context — passed by users via createCaller defaults or per-call.
 * Carries the original Request/Response and forwarded headers for SSR scenarios
 * (cookie propagation, header forwarding, etc.).
 */
export type RequestContext = {
  req?: Request | undefined;
  res?: Response | undefined;
  headers?: Headers | undefined;
};

/**
 * Internal execution context — extends RequestContext with adapter-only metadata.
 * Set by framework adapters (apiRoute, sseRoute, ws handler) and read by
 * executeRequest, middleware, and studio instrumentation. Not part of the
 * public API for direct callers.
 */
export type Context = RequestContext & {
  /** HTTP method of the proxy request (set by apiRoute) */
  proxyMethod?: "GET" | "POST" | undefined;
  /** Override mode for studio events (e.g. playground replay preserving original mode) */
  mode?: "direct" | "proxy" | undefined;
  /** High-resolution timestamp when the proxy adapter received the request (performance.now()) */
  proxyReceiveAt?: number | undefined;
  /**
   * The id Studio was told the call arrived under — the proxy announces a
   * call before reading its body. The call carries on under it, and a
   * refusal before it runs ends it with `request:error`.
   */
  studioRequestId?: string | undefined;
  /** A direct caller's default timeout, for a call and an endpoint that name none */
  defaultTimeout?: number | undefined;
  /**
   * The request being served, as an adapter describes it for the session —
   * where it can hand the browser a cookie, and what its framework asks of
   * `fetch`. Set, it is read before `req` and `headers`.
   */
  incoming?: IncomingRequest | undefined;
  /** The agent the call comes from, when an MCP server made it for one. */
  agent?: AgentCall | undefined;
};
