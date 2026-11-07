import { HTTPError } from "../errors";
import type { EndpointHold } from "../utils/cancel-previous";
import { cancellation } from "../utils/cancellation";
import { ownField, ownFields } from "../utils/own";
import { compileUrl, resolveBasePath } from "../utils/url";
import { stripUndefined } from "./body-builder";
import { type RequestOptions, withCallTransport } from "./call-transport";
import { buildRequestOptions } from "./request-builder";
import { assertReadable, getResponse } from "./response";
import type {
  BoundMethodOptions,
  Context,
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
  /** The call's hold on its endpoint, which a newer call takes: set when its `cancelPrevious` is on. */
  hold: EndpointHold | undefined;
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

/** What a call's methods are bound with, read once for all of them. */
export interface BoundParts {
  readonly cleanedVars: unknown;
  readonly boundHeaders: HeadersInit | undefined;
  readonly stream: boolean | undefined;
  readonly boundFetchOptions: Record<string, unknown>;
  readonly prefix: string;
  readonly pathOptions: PathOptions | undefined;
}

/**
 * What a call's methods are bound with: the call's options and its group's,
 * each read as its own fields once, for every verb the call may send with.
 *
 * @param boundOptions - The call's options
 * @param groupOptions - The settings its group gives, merged down its path
 * @returns The parts each method is bound with
 * @example
 * ```ts
 * const bound = boundParts(options, groupOptions);
 * const get = bindMethod(deps, "get", bound);
 * ```
 */
export function boundParts(
  boundOptions?: BoundMethodOptions,
  groupOptions?: GroupOptions,
): BoundParts {
  const { variables: vars, headers: boundHeaders, stream, ...boundRest } = ownFields(boundOptions);
  const { prefix = "", pathOptions } = ownFields(groupOptions);
  return {
    cleanedVars: stripUndefined(vars),
    boundHeaders,
    stream,
    boundFetchOptions: withCallTransport(boundRest, groupOptions),
    prefix,
    pathOptions,
  };
}

export function bindMethod(
  deps: BindMethodDeps,
  method: HttpMethod,
  bound: BoundParts,
): BoundMethod {
  const { cleanedVars, boundHeaders, stream, boundFetchOptions, prefix, pathOptions } = bound;

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
    const { responseType: readAs, ...options } = ownFields(requested);
    /* A streamed answer is read as it arrives, by one reader: never shared, never kept. */
    if (stream) options.coalesce = false;
    const { hold } = deps;

    try {
      /* The call's signal carries its hold's, through which a newer call cancels it; each
         attempt first asks whether one has superseded it meanwhile. */
      hold?.sending();
      const sending = deps.fetchRequest(method, url, options);
      hold?.sent();
      const response = await sending;
      hold?.returned();
      assertReadable(response);

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
      hold?.returned();
      const signal = ownField(options, "signal");
      if (signal?.aborted) throw cancellation(signal);
      throw error;
    }
  };
}
