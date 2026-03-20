import { mergeHeaders } from "../utils/merge-headers";
import { buildBody, toSearchParams } from "./body-builder";
import { stripPathParams, toHeadersInit } from "./path-params";
import type {
  FetchOptions,
  HttpMethod,
  MethodParameters,
  SearchParamsSerializer,
  SimpleOptions,
} from "./types";

type RequestBuilderDeps = {
  allowedHeaders?: string[];
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
    headers: mergeHeaders(boundHeaders, toHeadersInit(optionHeaders), deps.allowedHeaders),
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
  newVariables: FormData | Record<string, unknown> | undefined,
  newSearchParameters: Record<string, unknown>,
  deps: RequestBuilderDeps,
): Partial<FetchOptions> {
  const searchParameters =
    arguments_[2] && "searchParams" in arguments_[2] ? arguments_[2].searchParams : undefined;

  const { headers: optionHeaders, ...otherArgumentOptions } = arguments_[2] || {};

  const directVars = stripPathParams(
    path,
    arguments_[1] as FormData | Record<string, unknown> | undefined,
  );

  return {
    ...otherArgumentOptions,
    ...boundFetchOptions,
    ...prefixUrlOverride,
    headers: mergeHeaders(boundHeaders, optionHeaders, deps.allowedHeaders),
    ...buildBody(
      method,
      (directVars || newVariables) as FormData | Record<string, unknown> | undefined,
      { ...searchParameters, ...newSearchParameters },
      deps.defaultBody,
      deps.defaultQueryParams,
      deps.searchParamsSerializer,
      deps.bodySerializer,
    ),
  };
}

/** Build fetch options based on HTTP method */
export function buildRequestOptions(
  method: HttpMethod,
  path: string,
  arguments_: MethodParameters<HttpMethod>,
  boundHeaders: HeadersInit | undefined,
  boundFetchOptions: Record<string, unknown>,
  prefixUrlOverride: Record<string, unknown>,
  newVariables: FormData | Record<string, unknown> | undefined,
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
