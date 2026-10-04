import type { FlatClient, MixedClient, TypedClient } from "./client";
import { buildClientProxy } from "./client";
import { shapeOfSource } from "./client/shape";
import type {
  AnyDefinedApi,
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "./define";
import type { HTTPError } from "./errors";
import type { RequestContext } from "./http-client/types";
import type { CallerWSOptions } from "./realtime/ws/ws-types";
import { composeBackend } from "./transport/compose-backend";
import { createDirectHTTPExecutor } from "./transport/direct/http";
import { directStreamingFactories } from "./transport/direct-streaming";

export type CallerDefaults = {
  timeout?: number | undefined;
  headers?: Record<string, string> | undefined;
  context?: RequestContext | undefined;
  onError?: ((error: HTTPError) => void | Promise<void>) | undefined;
  onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
  /**
   * How the sockets of this caller's channels and push subscriptions behave:
   * the token sent on connecting and when the server asks for a fresh one,
   * the reconnect backoff, how long the server may stay silent, the queue
   * limits, sub-protocols and the largest message sent.
   */
  ws?: CallerWSOptions | undefined;
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
export function createCaller<TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
  source: DefinedMixedApi<TGroups, TEndpoints>,
  defaults?: CallerDefaults,
): MixedClient<TGroups, TEndpoints>;

export function createCaller<TEndpoints extends EndpointRecord>(
  source: DefinedFlatApi<TEndpoints>,
  defaults?: CallerDefaults,
): FlatClient<TEndpoints>;

export function createCaller<TApi extends DefinedApi>(
  source: TApi,
  defaults?: CallerDefaults,
): TypedClient<TApi>;

/* A flat source defined with no endpoints yet is only its options, and the
   flat overload cannot tell its endpoints apart from them, so none matched. */
export function createCaller(
  source: DefinedFlatApi<Record<never, never>>,
  defaults?: CallerDefaults,
): FlatClient<Record<never, never>>;

export function createCaller(source: AnyDefinedApi, defaults: CallerDefaults = {}): unknown {
  const http = createDirectHTTPExecutor(source, defaults);
  const backend = composeBackend(
    source as Record<string, unknown>,
    http,
    directStreamingFactories(source, defaults),
  );

  return buildClientProxy(backend, {}, false, shapeOfSource(source as Record<string, unknown>));
}
