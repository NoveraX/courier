import { supportsAbortController } from "../utils/cancel-previous";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { bindMethod } from "./bind-method";
import type { RequestOptions } from "./call-transport";
import { httpPath } from "./http-path";
import { overlayHeaders, withoutConnectionHeaders } from "./request-headers";
import { type PlatformFetch, platformFetchOf } from "./source-transport";
import type {
  BaseOptions,
  BoundMethodOptions,
  Context,
  GroupOptions,
  HttpMethods,
  PathOptions,
  ResponseType,
  SearchParamsSerializer,
} from "./types";
import type { WebBody } from "./web-types";

export class HttpClient {
  private responseType: ResponseType = "json";
  private responseParser: ((response: Response) => Promise<unknown>) | undefined;
  private defaultBody: Record<string, unknown> = {};
  private defaultQueryParams: Record<string, unknown> | undefined;
  private pathOptions: PathOptions | undefined;
  private bodySerializer: ((data: Record<string, unknown>) => WebBody) | undefined;
  private searchParamsSerializer: SearchParamsSerializer | undefined;
  /**
   * The endpoint whose newer call cancels this client's call while it is in
   * flight: set for a read whose `cancelPrevious` is on, made where one user
   * is.
   */
  cancelKey: string | undefined;
  /**
   * Whether the endpoint this client calls reads or writes, as its API
   * declares: an identical declared read in flight is joined whatever verb
   * carries it — a search sent as a POST — and a declared write never is.
   */
  kind: "query" | "mutation" | undefined;
  private prefixUrl = "";
  private baseTimeout: number | undefined;
  private baseHeaders: HeadersInit | undefined;
  private baseFetchInit: RequestInit = {};
  private sourceFetch: PlatformFetch | undefined;

  context: Context | undefined;
  pendingRequests: { [key: string]: AbortController } = {};
  /** Hook called with resolved (method, fullUrl) right before fetch */
  onBeforeFetch?: (method: string, url: string) => void;

  constructor(options?: BaseOptions, context?: Context) {
    this.init(options, context);
  }

  private init(options?: BaseOptions, context?: Context) {
    this.context = context;
    const {
      baseURL,
      responseType = "json",
      responseParser,
      defaultBody,
      defaultQueryParams,
      /* Governs what a browser may forward, which the executor applies before
         the call reaches this client. */
      allowedHeaders: _allowedHeaders,
      pathOptions,
      bodySerializer,
      searchParamsSerializer,
      /* Decided per endpoint where the call is made, which sets `cancelKey`. */
      cancelPrevious: _cancelPrevious,
      middleware: _middleware,
      /* Read by the executor, which builds what they send from the request
         being served; neither is anything `fetch` knows. */
      session: _session,
      forward: _forward,
      /* What the proxy and Studio read; never anything `fetch` is given. */
      expose: _expose,
      proxyPath: _proxyPath,
      webSocket: _webSocket,
      fetch: sourceFetch,
      timeout,
      headers,
      ...baseFetchInit
    } = options || {};

    this.responseType = responseType;
    this.responseParser = responseParser;
    this.defaultBody = { ...defaultBody };
    this.pathOptions = pathOptions;
    this.bodySerializer = bodySerializer;
    this.searchParamsSerializer = searchParamsSerializer;
    this.prefixUrl = baseURL || "";
    this.baseTimeout = timeout;
    this.baseHeaders = headers;
    this.baseFetchInit = baseFetchInit as RequestInit;
    this.sourceFetch = sourceFetch && platformFetchOf(sourceFetch);

    if (defaultQueryParams) {
      this.defaultQueryParams = { ...defaultQueryParams };
    }
  }

  private async fetchRequest(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const { prefixUrl: overridePrefixUrl, withinOrigin, fetch: send, ...fetchOptions } = options;

    const effectivePrefixUrl = overridePrefixUrl !== undefined ? overridePrefixUrl : this.prefixUrl;
    let fullUrl = url;
    if (effectivePrefixUrl) {
      const base = effectivePrefixUrl.endsWith("/") ? effectivePrefixUrl : `${effectivePrefixUrl}/`;
      const path = url.startsWith("/") ? url.slice(1) : url;
      fullUrl = `${base}${path}`;
    }

    if (this.onBeforeFetch) {
      let hookUrl = fullUrl;
      const sp = fetchOptions.searchParams;
      if (sp) {
        const qs =
          sp instanceof URLSearchParams
            ? sp.toString()
            : typeof sp === "string"
              ? sp
              : new URLSearchParams(sp as Record<string, string>).toString();
        if (qs) hookUrl += (hookUrl.includes("?") ? "&" : "?") + qs;
      }
      this.onBeforeFetch(method, hookUrl);
    }

    /* The call always carries a header set of its own, so spreading it over
       the source's replaced the source's headers wholesale; they are laid
       underneath instead, and a header the call names wins. Headers of the
       connection a forwarded set was copied from are fetch's own to set. A
       call that came through the proxy carries the server's credentials, and
       a redirect must not take them to a host the source never named, nor
       must one that carries the user's session. */
    return coreFetch(method, fullUrl, {
      ...this.baseFetchInit,
      ...fetchOptions,
      headers: withoutConnectionHeaders(overlayHeaders(this.baseHeaders, fetchOptions.headers)),
      timeout: fetchOptions.timeout ?? this.baseTimeout,
      withinOrigin: withinOrigin === true || this.context?.proxyMethod !== undefined,
      /* A group's or a call's own `fetch` sends in place of the source's. */
      ...((send ?? this.sourceFetch) && { fetch: send ?? this.sourceFetch }),
      ...(this.kind !== undefined && { reads: this.kind === "query" }),
    } as CoreFetchInit);
  }

  createMethods(options?: BoundMethodOptions, groupOptions?: GroupOptions): HttpMethods {
    const deps = {
      context: this.context,
      prefixUrl: this.prefixUrl,
      pendingRequests: this.pendingRequests,
      cancelKey: supportsAbortController ? this.cancelKey : undefined,
      pathOptions: this.pathOptions,
      searchParamsSerializer: this.searchParamsSerializer,
      defaultQueryParams: this.defaultQueryParams,
      defaultBody: this.defaultBody,
      bodySerializer: this.bodySerializer,
      responseType: this.responseType,
      responseParser: this.responseParser,
      fetchRequest: this.fetchRequest.bind(this),
    };

    return {
      get: bindMethod(deps, "get", options, groupOptions),
      post: bindMethod(deps, "post", options, groupOptions),
      put: bindMethod(deps, "put", options, groupOptions),
      patch: bindMethod(deps, "patch", options, groupOptions),
      del: bindMethod(deps, "del", options, groupOptions),
      head: bindMethod(deps, "head", options, groupOptions),
      options: bindMethod(deps, "options", options, groupOptions),
      query: bindMethod(deps, "query", options, groupOptions),
      path: httpPath,
    };
  }
}
