import { HTTPError } from "../errors";
import { isAbortError } from "../utils/abort";
import {
  cleanupDeduplication,
  deduplicateAndAbortPrevious,
  getDedupeKey,
} from "../utils/deduplicate";
import { compileUrl, resolveBasePath } from "../utils/helpers";
import { stripUndefined } from "./body-builder";
import { buildRequestOptions } from "./request-builder";
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
} from "./types";

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

  return async <TResponse>(...arguments_: MethodParameters<typeof method>) => {
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
    const options = buildRequestOptions(
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

    const dedupeKey = deps.deduplicate ? getDedupeKey(url, method) : undefined;
    const dedupeController = dedupeKey ? applyDeduplication(deps, dedupeKey, options) : undefined;
    const forget = (): void => {
      if (dedupeKey && dedupeController) {
        cleanupDeduplication(
          { pendingRequests: deps.pendingRequests },
          dedupeKey,
          dedupeController,
        );
      }
    };

    try {
      const response = await deps.fetchRequest(method, url, options);
      forget();

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

      return result as HttpResponse<TResponse>;
    } catch (error) {
      forget();
      /* A cancellation the caller asked for is rethrown as fetch rejected it
         — an AbortError unless they gave another reason. */
      if (error instanceof HTTPError || isAbortError(error)) throw error;

      if (error instanceof Error) {
        const cause = error.cause instanceof Error ? error.cause : error;
        const code = "code" in cause ? String(cause.code) : undefined;
        throw new HTTPError(
          {
            status: 0,
            headers: new Headers(),
            data: { success: false, message: cause.message, ...(code && { code }) },
          },
          { cause: error },
        );
      }

      throw error;
    }
  };
}

function applyDeduplication(
  deps: BindMethodDeps,
  dedupeKey: string,
  options: Partial<FetchOptions>,
): AbortController {
  const controller = deduplicateAndAbortPrevious(
    { pendingRequests: deps.pendingRequests },
    dedupeKey,
  );
  options.signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  return controller;
}
