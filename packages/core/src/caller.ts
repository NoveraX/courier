import { buildClientProxy, type ExecuteBackend, type TypedClient } from "./client";
import type { DefinedApi } from "./define/types";
import { HTTPError } from "./error";
import type { Context } from "./http-client/types";
import { executeRequest } from "./utils/execute";

export type CallerDefaults = {
  timeout?: number;
  headers?: Record<string, string>;
  context?: Context;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

/**
 * Create a typed client for direct (universal) mode.
 * Works everywhere: browser, Node.js, Deno, Bun.
 *
 * @example
 * ```ts
 * const client = createCaller(api);
 *
 * // Data only:
 * const users = await client.users.getAll();
 *
 * // Full HTTP response:
 * const response = await client.users.raw.getById({ id: 1 });
 *
 * // With options:
 * const fast = client.with({ timeout: 1000 });
 * await fast.users.getAll();
 * ```
 */
export function createCaller<T extends DefinedApi<any>>(
  source: T,
  defaults: CallerDefaults = {},
): TypedClient<T> {
  const {
    timeout: defaultTimeout,
    headers: defaultHeaders,
    context: defaultContext,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  const sources = { _: source };

  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    const mergedOptions: Record<string, unknown> = { ...options };

    if (raw) mergedOptions.rawData = true;

    if (mergedOptions.timeout === undefined && defaultTimeout !== undefined) {
      mergedOptions.timeout = defaultTimeout;
    }

    if (defaultHeaders) {
      mergedOptions.headers = options.headers
        ? {
            ...defaultHeaders,
            ...Object.fromEntries(new Headers(options.headers as HeadersInit)),
          }
        : defaultHeaders;
    }

    const requestPayload = {
      source: "_",
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

  return buildClientProxy<T>(backend);
}
