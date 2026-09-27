import { buildBody, buildSearchParams, toSearchParams } from "./body-builder";
import { stripPathParams, toHeadersInit } from "./path-params";
import { overlayHeaders } from "./request-headers";
import type {
  FetchOptions,
  HttpMethod,
  MethodParameters,
  SearchParamsSerializer,
  SimpleOptions,
} from "./types";

type RequestBuilderDeps = {
  defaultQueryParams?: Record<string, unknown>;
  defaultBody: Record<string, unknown>;
  searchParamsSerializer?: SearchParamsSerializer;
  bodySerializer?: (data: Record<string, unknown>) => BodyInit;
};

/** Build fetch options for HEAD requests (no body, just search params) */
function buildHeadOptions(
  arguments_: MethodParameters<"head">,
  boundHeaders: HeadersInit | undefined,
  boundFetchOptions: Record<string, unknown>,
  prefixUrlOverride: Record<string, unknown>,
  newSearchParameters: Record<string, unknown>,
  deps: RequestBuilderDeps,
): Partial<FetchOptions> {
  const { headers: optionHeaders, ...otherArgumentOptions } =
    (arguments_[1] as SimpleOptions) || {};

  return {
    ...otherArgumentOptions,
    ...boundFetchOptions,
    ...prefixUrlOverride,
    headers: overlayHeaders(boundHeaders, toHeadersInit(optionHeaders)),
    searchParams: toSearchParams(
      { ...deps.defaultQueryParams, ...newSearchParameters },
      deps.searchParamsSerializer,
    ),
  };
}

/** Build fetch options for non-HEAD requests (with body + search params) */
function buildStandardOptions(
  method: HttpMethod,
  path: string,
  arguments_: MethodParameters<HttpMethod>,
  boundHeaders: HeadersInit | undefined,
  boundFetchOptions: Record<string, unknown>,
  prefixUrlOverride: Record<string, unknown>,
  newVariables: unknown,
  newSearchParameters: Record<string, unknown>,
  deps: RequestBuilderDeps,
): Partial<FetchOptions> {
  const searchParameters =
    arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

  const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

  const directVars = stripPathParams(path, arguments_[1]);
  const query = { ...searchParameters, ...newSearchParameters };

  return {
    ...otherArgumentOptions,
    ...boundFetchOptions,
    ...prefixUrlOverride,
    /* Written by the endpoint's author, not received from a browser, so the
       forwarding allowlist has no say over them. */
    headers: overlayHeaders(boundHeaders, optionHeaders),
    /* A body the closure names is the request's body; the variables then only
       fill the path. Built from them as well, their JSON replaced it. */
    ...(namesItsBody(otherArgumentOptions)
      ? buildSearchParams(undefined, query, deps.defaultQueryParams, deps.searchParamsSerializer)
      : buildBody(
          method,
          directVars ?? newVariables,
          query,
          deps.defaultBody,
          deps.defaultQueryParams,
          deps.searchParamsSerializer,
          deps.bodySerializer,
        )),
  };
}

/** Whether a closure's options carry the request body themselves. */
function namesItsBody(options: object): boolean {
  return (
    ("body" in options && options.body != null) || ("json" in options && options.json !== undefined)
  );
}

/** Build fetch options based on HTTP method */
export function buildRequestOptions(
  method: HttpMethod,
  path: string,
  arguments_: MethodParameters<HttpMethod>,
  boundHeaders: HeadersInit | undefined,
  boundFetchOptions: Record<string, unknown>,
  prefixUrlOverride: Record<string, unknown>,
  newVariables: unknown,
  newSearchParameters: Record<string, unknown>,
  deps: RequestBuilderDeps,
): Partial<FetchOptions> {
  if (method === "head") {
    return buildHeadOptions(
      arguments_ as MethodParameters<"head">,
      boundHeaders,
      boundFetchOptions,
      prefixUrlOverride,
      newSearchParameters,
      deps,
    );
  }

  return buildStandardOptions(
    method,
    path,
    arguments_,
    boundHeaders,
    boundFetchOptions,
    prefixUrlOverride,
    newVariables,
    newSearchParameters,
    deps,
  );
}
