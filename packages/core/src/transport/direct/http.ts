import { getSourceName } from "../../define/api";
import { assertCancelPrevious } from "../../define/assert-cancel-previous";
import type { AnyDefinedApi } from "../../define/types";
import { HTTPError } from "../../errors";
import type { RequestContext } from "../../http-client/types";
import { executeRequest } from "../../utils/execute";
import { layerHeaders } from "../../utils/layer-headers";
import type { HTTPExecutor } from "../types";

export interface DirectHTTPDefaults {
  timeout?: number | undefined;
  cancelPrevious?: boolean | undefined;
  headers?: Record<string, string> | undefined;
  context?: RequestContext | undefined;
  onError?: ((error: HTTPError) => void | Promise<void>) | undefined;
  onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
}

/**
 * Create a direct-mode HTTP executor that runs endpoint functions in-process
 * via executeRequest. Used by createCaller (universal mode) and
 * createQueryCaller (React direct mode).
 *
 * Both runtime contexts (browser, Node, Deno, Bun) work because executeRequest
 * uses the universal HttpClient (native fetch wrapper).
 */
export function createDirectHTTPExecutor(
  api: AnyDefinedApi,
  defaults: DirectHTTPDefaults = {},
): HTTPExecutor {
  const sourceName = getSourceName(api) ?? "_";
  const sources = { [sourceName]: api };
  const {
    timeout: defaultTimeout,
    headers: defaultHeaders,
    context: defaultContext,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
    cancelPrevious: defaultCancelPrevious,
  } = defaults;
  assertCancelPrevious(defaultCancelPrevious, "A caller");

  /* The defaults are the least specific of their kind: carried beside the
     call's options, they give way to the endpoint's own `.timeout()` and
     `.cancelPrevious()`, and the latter to its groups' too. */
  const context =
    defaultTimeout === undefined && defaultCancelPrevious === undefined
      ? defaultContext
      : {
          ...defaultContext,
          ...(defaultTimeout !== undefined && { defaultTimeout }),
          ...(defaultCancelPrevious !== undefined && { defaultCancelPrevious }),
        };

  return async function executeHTTP(group, method, variables, options, raw) {
    const mergedOptions = mergeOptions(options, raw, defaultHeaders);
    const requestPayload = {
      source: sourceName,
      group,
      method,
      variables,
      options: mergedOptions,
    };

    try {
      const result = await executeRequest(sources, requestPayload, context);
      await globalOnSuccess?.(result);
      return result;
    } catch (error) {
      if (error instanceof HTTPError) {
        await globalOnError?.(error);
      }
      throw error;
    }
  };
}

function mergeOptions(
  options: Record<string, unknown>,
  raw: boolean,
  defaultHeaders: Record<string, string> | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...options };
  if (raw) merged.rawData = true;
  /* Laid name by name, a record's own entries read: handed to `Headers` whole, Node's conversion of
     the call's record dropped a header `__proto__`. */
  if (defaultHeaders) {
    merged.headers = options.headers
      ? layerHeaders(defaultHeaders, options.headers)
      : defaultHeaders;
  }
  return merged;
}
