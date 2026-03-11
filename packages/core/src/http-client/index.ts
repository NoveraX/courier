import { HTTPError } from "../error";
import {
  cleanupDeduplication,
  deduplicateAndAbortPrevious,
  getDedupeKey,
  supportsAbortController,
} from "../utils/deduplicate";
import { coreFetch } from "../utils/fetch";
import { compileUrl, isFormData, resolveBasePath } from "../utils/helpers";
import { mergeHeaders } from "../utils/merge-headers";

const toHeadersInit = (value: unknown): HeadersInit | undefined => {
  if (value instanceof Headers) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value as Record<string, string>;
  return undefined;
};

import type {
  BaseOptions,
  BoundMethodOptions,
  Context,
  FetchOptions,
  GroupOptions,
  HttpMethod,
  HttpMethods,
  HttpResponse,
  MethodParameters,
  PathOptions,
  ResponseType,
  SearchParamsSerializer,
  SimpleOptions,
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
      onDownloadProgress: _dp,
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
    const { prefixUrl: overridePrefixUrl, onDownloadProgress: _dp, ...fetchOptions } = options;

    const effectivePrefixUrl = overridePrefixUrl !== undefined ? overridePrefixUrl : this.prefixUrl;
    let fullUrl = url;
    if (effectivePrefixUrl) {
      const base = effectivePrefixUrl.endsWith("/") ? effectivePrefixUrl : `${effectivePrefixUrl}/`;
      const path = url.startsWith("/") ? url.slice(1) : url;
      fullUrl = `${base}${path}`;
    }

    return coreFetch(method, fullUrl, {
      ...this.baseFetchInit,
      ...fetchOptions,
      timeout: fetchOptions.timeout ?? this.baseTimeout,
    });
  }

  private toSearchParams(variables?: Record<string, unknown>) {
    if (!variables || Object.keys(variables).length === 0) return;

    if (this.searchParamsSerializer) {
      return this.searchParamsSerializer.stringify(variables);
    }

    return new URLSearchParams(Object.entries(variables).map(([k, v]) => [k, String(v)]));
  }

  private stripUndefined(variables?: FormData | Record<string, unknown>) {
    if (isFormData(variables)) {
      for (const key of variables.keys()) {
        if (variables.get(key) === undefined) {
          variables.delete(key);
        }
      }

      return variables;
    }

    if (typeof variables === "object" && variables !== null) {
      return Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined));
    }

    return;
  }

  private buildSearchParams(
    variables?: Record<string, unknown>,
    searchParameters?: Record<string, unknown>,
  ): Pick<FetchOptions, "searchParams"> | undefined {
    const params = this.toSearchParams({
      ...this.defaultQueryParams,
      ...searchParameters,
      ...variables,
    });
    return params ? { searchParams: params } : undefined;
  }

  private buildRequestBody(
    variables?: FormData | Record<string, unknown>,
  ): Pick<FetchOptions, "body" | "json"> | undefined {
    if (isFormData(variables)) {
      this.filterEmptyFiles(variables);
      return { body: variables };
    }

    const json = { ...this.defaultBody, ...variables };
    if (Object.keys(json).length === 0) return undefined;

    if (this.bodySerializer) {
      return { body: this.bodySerializer(json) };
    }
    return { json };
  }

  private filterEmptyFiles(formData: FormData) {
    const emptyKeys = [...formData.entries()]
      .filter(([, value]) => value instanceof File && value.size === 0)
      .map(([key]) => key);

    for (const key of emptyKeys) {
      formData.delete(key);
    }
  }

  private buildBody(
    method: HttpMethod,
    variables?: FormData | Record<string, unknown>,
    searchParameters?: Record<string, unknown>,
  ): Pick<FetchOptions, "body" | "json" | "searchParams"> | undefined {
    variables = this.stripUndefined(variables);

    switch (method) {
      case "head":
        return;
      case "get":
      case "del":
        return this.buildSearchParams(
          isFormData(variables) ? undefined : variables,
          searchParameters,
        );
      default:
        return {
          ...this.buildSearchParams(undefined, searchParameters),
          ...this.buildRequestBody(variables),
        };
    }
  }

  private async getResponse(response: Response, message?: string) {
    const data = await this.getResponseData(response, message);

    const { status, headers } = response;

    return { status, headers, data };
  }

  private async getResponseData(response: Response, message?: string): Promise<unknown> {
    if (response.status === 204) {
      return null;
    }

    try {
      if (this.responseParser) {
        return await this.responseParser(response);
      }

      switch (this.responseType) {
        case "text":
          return await response.text();
        case "blob":
          return await response.blob();
        case "arrayBuffer":
          return await response.arrayBuffer();
        case "formData":
          return await response.formData();
        default:
          return await response.json();
      }
    } catch {
      const fallbackMessage = message || "Failed to parse response body";
      throw new HTTPError({
        status: response.status,
        headers: response.headers,
        data: { success: false, message: fallbackMessage },
      });
    }
  }

  private bindMethod(
    method: HttpMethod,
    boundOptions?: BoundMethodOptions,
    groupOptions?: GroupOptions,
  ) {
    const {
      variables: vars,
      headers: boundHeaders,
      stream,
      ...boundFetchOptions
    } = boundOptions || {};
    const { prefix = "", pathOptions } = groupOptions || {};

    const cleanedVars = this.stripUndefined(vars as FormData | Record<string, unknown> | undefined);

    return async <T>(...arguments_: MethodParameters<typeof method>) => {
      const commonPathOptions = (await this.pathOptions?.(this.context?.req)) || {};
      const groupPathOptions = (await pathOptions?.(this.context?.req)) || {};
      const generatedPathOptions = {
        ...commonPathOptions,
        ...groupPathOptions,
      };

      const { path, baseUrl } = resolveBasePath(prefix, arguments_[0]);

      const [url, newVariables, newSearchParameters] = compileUrl(
        path,
        cleanedVars,
        generatedPathOptions,
        this.searchParamsSerializer,
      );

      const prefixUrlOverride = baseUrl ? { prefixUrl: baseUrl } : {};

      let options: Partial<FetchOptions>;

      if (method === "head") {
        const { headers: optionHeaders, ...otherArgumentOptions } =
          (arguments_[1] as SimpleOptions) || {};

        options = {
          ...otherArgumentOptions,
          ...boundFetchOptions,
          ...prefixUrlOverride,
          headers: mergeHeaders(boundHeaders, toHeadersInit(optionHeaders), this.allowedHeaders),
          searchParams: this.toSearchParams({
            ...this.defaultQueryParams,
            ...newSearchParameters,
          }),
        };
      } else {
        const searchParameters =
          arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

        const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

        options = {
          ...otherArgumentOptions,
          ...boundFetchOptions,
          ...prefixUrlOverride,
          headers: mergeHeaders(boundHeaders, optionHeaders, this.allowedHeaders),
          ...this.buildBody(
            method,
            (arguments_[1] || newVariables) as FormData | Record<string, unknown> | undefined,
            {
              ...searchParameters,
              ...newSearchParameters,
            },
          ),
        };
      }

      // Deduplication: abort previous request with the same key
      let dedupeKey: string | undefined;
      if (this.deduplicate) {
        dedupeKey = getDedupeKey(url, method);
        const controller = deduplicateAndAbortPrevious(this, dedupeKey);

        options.signal = options.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal;
      }

      try {
        const response = await this.fetchRequest(method, url, options);

        if (dedupeKey) cleanupDeduplication(this, dedupeKey);

        if (!response.ok) {
          const errorResponse = await this.getResponse(response, `HTTP ${response.status}`);
          throw new HTTPError(errorResponse);
        }

        const result = stream
          ? { status: response.status, headers: response.headers, data: response.body }
          : await this.getResponse(response);

        return result as HttpResponse<T>;
      } catch (error) {
        if (dedupeKey) cleanupDeduplication(this, dedupeKey);

        if (error instanceof HTTPError) throw error;

        if (error instanceof Error) {
          const cause = error.cause instanceof Error ? error.cause : error;
          const code = "code" in cause ? String(cause.code) : undefined;
          throw new HTTPError({
            status: 0,
            headers: new Headers(),
            data: { success: false, message: cause.message, ...(code && { code }) },
          });
        }

        throw error;
      }
    };
  }

  createMethods(options?: BoundMethodOptions, groupOptions?: GroupOptions): HttpMethods {
    return {
      get: this.bindMethod("get", options, groupOptions),
      post: this.bindMethod("post", options, groupOptions),
      put: this.bindMethod("put", options, groupOptions),
      patch: this.bindMethod("patch", options, groupOptions),
      del: this.bindMethod("del", options, groupOptions),
      head: this.bindMethod("head", options, groupOptions),
    };
  }
}
