import { getSourceName } from "../../define/api";
import type { DefinedApi, DefinedFlatApi, DefinedMixedApi } from "../../define/types";
import { HTTPError } from "../../errors";
import type { RequestContext } from "../../http-client/types";
import { executeRequest } from "../../utils/execute";
import type { HTTPExecutor } from "../types";

export interface DirectHTTPDefaults {
  timeout?: number;
  headers?: Record<string, string>;
  context?: RequestContext;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
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
  api: DefinedApi | DefinedFlatApi | DefinedMixedApi,
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
  } = defaults;

  return async function executeHTTP(group, method, variables, options, raw) {
    const mergedOptions = mergeOptions(options, raw, defaultTimeout, defaultHeaders);
    const requestPayload = {
      source: sourceName,
      group,
      method,
      variables: variables as Record<string, unknown> | undefined,
      options: mergedOptions,
    };

    try {
      const result = await executeRequest(sources, requestPayload, defaultContext);
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
  defaultTimeout: number | undefined,
  defaultHeaders: Record<string, string> | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...options };
  if (raw) merged.rawData = true;
  if (merged.timeout === undefined && defaultTimeout !== undefined) {
    merged.timeout = defaultTimeout;
  }
  if (defaultHeaders) {
    merged.headers = options.headers
      ? { ...defaultHeaders, ...Object.fromEntries(new Headers(options.headers as HeadersInit)) }
      : defaultHeaders;
  }
  return merged;
}
