import { HTTPError } from "../errors";
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
  const cleanedVars = stripUndefined(vars);

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
    const requested = buildRequestOptions(
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

    /* A call that names how its answer is read overrides the source's
       reading, its parser included. */
    const { responseType: readAs, ...options } = requested;
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
        : readAs === undefined
          ? await getResponse(response, deps.responseType, deps.responseParser)
          : await getResponse(response, readAs);

      return result as HttpResponse<TResponse>;
    } catch (error) {
      /* Fetch's own rejection was classified where it happened; anything
         else — a path option that threw, a body that would not serialize —
         is the caller's own failure and stays what it was. A cancellation
         that lands while the answer is read stops the read with the
         caller's reason, and the reader reports that as a body it could
         not parse; it is rethrown as the cancellation it is. */
      forget();
      if (options.signal?.aborted) throw options.signal.reason;
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
