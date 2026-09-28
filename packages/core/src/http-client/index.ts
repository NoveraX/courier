import { supportsAbortController } from "../utils/deduplicate";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { bindMethod } from "./bind-method";
import { overlayHeaders, withoutConnectionHeaders } from "./request-headers";
import type {
  BaseOptions,
  BoundMethodOptions,
  Context,
  FetchOptions,
  GroupOptions,
  HttpMethods,
  PathOptions,
  ResponseType,
  SearchParamsSerializer,
} from "./types";
import type { WebBody } from "./web-types";

export class HttpClient {
  private responseType: ResponseType = "json";
  private responseParser?: (response: Response) => Promise<unknown>;
  private defaultBody: Record<string, unknown> = {};
  private defaultQueryParams?: Record<string, unknown>;
  private pathOptions?: PathOptions;
  private bodySerializer?: (data: Record<string, unknown>) => WebBody;
  private searchParamsSerializer?: SearchParamsSerializer;
  private deduplicate = false;
  private prefixUrl = "";
  private baseTimeout?: number;
  private baseHeaders?: HeadersInit;
  private baseFetchInit: RequestInit = {};

  context?: Context;
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
      deduplicate,
      middleware: _middleware,
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
    this.deduplicate = !!(deduplicate && supportsAbortController);
    this.prefixUrl = baseURL || "";
    this.baseTimeout = timeout;
    this.baseHeaders = headers;
    this.baseFetchInit = baseFetchInit as RequestInit;

    if (defaultQueryParams) {
      this.defaultQueryParams = { ...defaultQueryParams };
    }
  }

  private async fetchRequest(
    method: string,
    url: string,
    options: Partial<FetchOptions> = {},
  ): Promise<Response> {
    const { prefixUrl: overridePrefixUrl, ...fetchOptions } = options;

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
       a redirect must not take them to a host the source never named. */
    return coreFetch(method, fullUrl, {
      ...this.baseFetchInit,
      ...fetchOptions,
      headers: withoutConnectionHeaders(overlayHeaders(this.baseHeaders, fetchOptions.headers)),
      timeout: fetchOptions.timeout ?? this.baseTimeout,
      withinOrigin: this.context?.proxyMethod !== undefined,
    } as CoreFetchInit);
  }

  createMethods(options?: BoundMethodOptions, groupOptions?: GroupOptions): HttpMethods {
    const deps = {
      context: this.context,
      prefixUrl: this.prefixUrl,
      pendingRequests: this.pendingRequests,
      deduplicate: this.deduplicate,
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
    };
  }
}
