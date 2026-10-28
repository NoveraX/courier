import { HTTPError } from "../errors";
import { abortReason } from "../utils/abort-reason";
import { anySignal } from "../utils/any-signal";
import { forgetCall, type Supersession, supersedeCall } from "../utils/cancel-previous";
import { compileUrl, resolveBasePath } from "../utils/url";
import { stripUndefined } from "./body-builder";
import { type RequestOptions, withCallTransport } from "./call-transport";
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
import type { WebBody } from "./web-types";

export type BindMethodDeps = {
  context: Context | undefined;
  prefixUrl: string;
  pendingRequests: { [key: string]: AbortController };
  /** The endpoint whose newer call cancels this one while it is in flight: set when the call's `cancelPrevious` is on. */
  cancelKey: string | undefined;
  pathOptions: PathOptions | undefined;
  searchParamsSerializer: SearchParamsSerializer | undefined;
  defaultQueryParams: Record<string, unknown> | undefined;
  defaultBody: Record<string, unknown>;
  bodySerializer: ((data: Record<string, unknown>) => WebBody) | undefined;
  responseType: ResponseType;
  responseParser: ((response: Response) => Promise<unknown>) | undefined;
  fetchRequest: (method: string, url: string, options: RequestOptions) => Promise<Response>;
};

/** A method bound to a client: called with a path and options, it resolves to the answer. */
type BoundMethod = <TResponse>(
  ...arguments_: MethodParameters<HttpMethod>
) => Promise<HttpResponse<TResponse>>;

export function bindMethod(
  deps: BindMethodDeps,
  method: HttpMethod,
  boundOptions?: BoundMethodOptions,
  groupOptions?: GroupOptions,
): BoundMethod {
  const { variables: vars, headers: boundHeaders, stream, ...boundRest } = boundOptions || {};
  const { prefix = "", pathOptions } = groupOptions || {};
  const boundFetchOptions = withCallTransport(boundRest, groupOptions);
  const cleanedVars = stripUndefined(vars);

  return async <TResponse>(...arguments_: MethodParameters<HttpMethod>) => {
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
    /* A streamed answer is read as it arrives, by one reader: never shared, never kept. */
    if (stream) options.coalesce = false;
    const cancelKey = deps.cancelKey;
    const supersession = cancelKey ? supersede(deps, cancelKey, options) : undefined;
    const forget = (): void => {
      if (cancelKey && supersession) {
        forgetCall({ pendingRequests: deps.pendingRequests }, cancelKey, supersession.controller);
      }
    };

    try {
      const sending = deps.fetchRequest(method, url, options);
      supersession?.cancelSuperseded();
      const response = await sending;
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
      if (options.signal?.aborted) throw abortReason(options.signal);
      throw error;
    }
  };
}

function supersede(
  deps: BindMethodDeps,
  key: string,
  options: Partial<FetchOptions>,
): Supersession {
  const supersession = supersedeCall({ pendingRequests: deps.pendingRequests }, key);
  const { signal } = supersession.controller;
  options.signal = options.signal ? anySignal([signal, options.signal]) : signal;
  return supersession;
}
