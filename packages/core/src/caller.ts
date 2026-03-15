import {
  buildClientProxy,
  type ExecuteBackend,
  type FlatClient,
  type MixedClient,
  type TypedClient,
} from "./client";
import { getSourceName } from "./define";
import type {
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "./define/types";
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
 * const client = createCaller(api)
 *
 * // Grouped: client.users.getAll()
 * // Flat:    client.getAll()
 * // Mixed:   client.users.getAll() + client.healthCheck()
 *
 * // .raw and .with() — at any level:
 * await client.raw.users.getById({ id: 1 })        // client level
 * await client.users.raw.getById({ id: 1 })         // group level
 * await client.getAll.raw()                          // flat method level
 * await client.with({ timeout: 5000 }).getAll()      // client level
 * await client.getAll.with({ timeout: 5000 })()      // flat method level
 * ```
 */
export function createCaller<G extends GroupRecord, E extends EndpointRecord>(
  source: DefinedMixedApi<G, E>,
  defaults?: CallerDefaults,
): MixedClient<G, E>;

export function createCaller<E extends EndpointRecord>(
  source: DefinedFlatApi<E>,
  defaults?: CallerDefaults,
): FlatClient<E>;

export function createCaller<T extends DefinedApi>(
  source: T,
  defaults?: CallerDefaults,
): TypedClient<T>;

export function createCaller(
  source: DefinedApi | DefinedFlatApi | DefinedMixedApi,
  defaults: CallerDefaults = {},
): unknown {
  const {
    timeout: defaultTimeout,
    headers: defaultHeaders,
    context: defaultContext,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  const sourceName = getSourceName(source) ?? "_";
  const sources = { [sourceName]: source };

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

  return buildClientProxy(backend);
}
