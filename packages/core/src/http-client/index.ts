import { supportsAbortController } from "../utils/deduplicate";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { bindMethod } from "./bind-method";
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

export class HttpClient {
  private responseType: ResponseType = "json";
  private responseParser?: (response: Response) => Promise<unknown>;
  private defaultBody: Record<string, unknown> = {};
  private defaultQueryParams?: Record<string, unknown>;
  private allowedHeaders?: string[];
  private pathOptions?: PathOptions;
  private bodySerializer?: (data: Record<string, unknown>) => BodyInit;
  private searchParamsSerializer?: SearchParamsSerializer;
  private deduplicate = false;
  private prefixUrl = "";
  private baseTimeout?: number;
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
      allowedHeaders,
      pathOptions,
      bodySerializer,
      searchParamsSerializer,
      deduplicate,
      middleware: _middleware,
      timeout,
      ...baseFetchInit
    } = options || {};

    this.responseType = responseType;
    this.responseParser = responseParser;
    this.defaultBody = { ...defaultBody };
    this.allowedHeaders = allowedHeaders;
    this.pathOptions = pathOptions;
    this.bodySerializer = bodySerializer;
    this.searchParamsSerializer = searchParamsSerializer;
    this.deduplicate = !!(deduplicate && supportsAbortController);
    this.prefixUrl = baseURL || "";
    this.baseTimeout = timeout;
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

    return coreFetch(method, fullUrl, {
      ...this.baseFetchInit,
      ...fetchOptions,
      timeout: fetchOptions.timeout ?? this.baseTimeout,
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
      allowedHeaders: this.allowedHeaders,
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
    };
  }
}
