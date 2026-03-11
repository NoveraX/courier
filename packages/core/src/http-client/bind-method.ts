import { HTTPError } from "../error";
import {
  cleanupDeduplication,
  deduplicateAndAbortPrevious,
  getDedupeKey,
} from "../utils/deduplicate";
import { compileUrl, resolveBasePath } from "../utils/helpers";
import { mergeHeaders } from "../utils/merge-headers";
import { buildBody, stripUndefined, toSearchParams } from "./body-builder";
import { getResponse } from "./response";
import type {
  BoundMethodOptions,
  Context,
  FetchOptions,
  GroupOptions,
  HttpMethod,
  HttpResponse,
  MethodParameters,
  PathOptions,
  ResponseType,
  SearchParamsSerializer,
  SimpleOptions,
} from "./types";

const toHeadersInit = (value: unknown): HeadersInit | undefined => {
  if (value instanceof Headers) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value as Record<string, string>;
  return undefined;
};

export type BindMethodDeps = {
  context?: Context;
  prefixUrl: string;
  pendingRequests: { [key: string]: AbortController };
  deduplicate: boolean;
  pathOptions?: PathOptions;
  searchParamsSerializer?: SearchParamsSerializer;
  allowedHeaders?: string[];
  defaultQueryParams?: Record<string, unknown>;
  defaultBody: Record<string, unknown>;
  bodySerializer?: (data: Record<string, unknown>) => BodyInit;
  responseType: ResponseType;
  responseParser?: (response: Response) => Promise<unknown>;
  fetchRequest: (method: string, url: string, options: Partial<FetchOptions>) => Promise<Response>;
};

export function bindMethod(
  deps: BindMethodDeps,
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

  const cleanedVars = stripUndefined(vars as FormData | Record<string, unknown> | undefined);

  return async <T>(...arguments_: MethodParameters<typeof method>) => {
    const commonPathOptions = (await deps.pathOptions?.(deps.context?.req)) || {};
    const groupPathOptions = (await pathOptions?.(deps.context?.req)) || {};
    const generatedPathOptions = { ...commonPathOptions, ...groupPathOptions };

    const { path, baseUrl } = resolveBasePath(prefix, arguments_[0]);

    const [url, newVariables, newSearchParameters] = compileUrl(
      path,
      cleanedVars,
      generatedPathOptions,
      deps.searchParamsSerializer,
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
        headers: mergeHeaders(boundHeaders, toHeadersInit(optionHeaders), deps.allowedHeaders),
        searchParams: toSearchParams(
          { ...deps.defaultQueryParams, ...newSearchParameters },
          deps.searchParamsSerializer,
        ),
      };
    } else {
      const searchParameters =
        arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

      const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

      options = {
        ...otherArgumentOptions,
        ...boundFetchOptions,
        ...prefixUrlOverride,
        headers: mergeHeaders(boundHeaders, optionHeaders, deps.allowedHeaders),
        ...buildBody(
          method,
          (arguments_[1] || newVariables) as FormData | Record<string, unknown> | undefined,
          { ...searchParameters, ...newSearchParameters },
          deps.defaultBody,
          deps.defaultQueryParams,
          deps.searchParamsSerializer,
          deps.bodySerializer,
        ),
      };
    }

    // Deduplication: abort previous request with the same key
    let dedupeKey: string | undefined;
    if (deps.deduplicate) {
      dedupeKey = getDedupeKey(url, method);
      const controller = deduplicateAndAbortPrevious(
        { pendingRequests: deps.pendingRequests },
        dedupeKey,
      );

      options.signal = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
    }

    try {
      const response = await deps.fetchRequest(method, url, options);

      if (dedupeKey) cleanupDeduplication({ pendingRequests: deps.pendingRequests }, dedupeKey);

      if (!response.ok) {
        const errorResponse = await getResponse(
          response,
          deps.responseType,
          deps.responseParser,
          `HTTP ${response.status}`,
        );
        throw new HTTPError(errorResponse);
      }

      const result = stream
        ? { status: response.status, headers: response.headers, data: response.body }
        : await getResponse(response, deps.responseType, deps.responseParser);

      return result as HttpResponse<T>;
    } catch (error) {
      if (dedupeKey) cleanupDeduplication({ pendingRequests: deps.pendingRequests }, dedupeKey);

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
