import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type { ChannelEndpoint, HttpEndpoint, StreamEndpoint } from "./call-shapes";
import type {
  CacheArg,
  ChannelEndpointOptions,
  HttpEndpointOptions,
  RetryOptions,
  StreamEndpointOptions,
} from "./options";
import type { ChannelProbe, HttpProbe, StreamProbe } from "./probe";

/**
 * Methods every builder carries that do not move its types.
 *
 * They return `this`, so they cost nothing to instantiate and may appear in
 * any order, including on a shared base that several endpoints extend.
 */
export interface NeutralMethods<TSelf> {
  /** Append middleware, running after anything inherited from the base. */
  use(...middleware: Middleware[]): TSelf;
  /** Response headers to forward to the caller. */
  headers(names: readonly string[]): TSelf;
  timeout(ms: number): TSelf;
  retry(options: RetryOptions): TSelf;
  /** Arbitrary values for tooling; ignored by the runtime. */
  meta(values: Record<string, unknown>): TSelf;
}

/**
 * Builder for an endpoint reached over HTTP.
 *
 * Slots replace a single type parameter each, so `.variables(A).response(B)`
 * and `.response(B).variables(A)` describe the same endpoint.
 */
export interface HttpBuilder<TResponse, TVariables, TKind extends "query" | "mutation">
  extends NeutralMethods<HttpBuilder<TResponse, TVariables, TKind>> {
  /** What the caller receives. Pass a schema to validate, or a type argument alone. */
  response<T>(schema?: StandardSchemaV1<unknown, T>): HttpBuilder<T, TVariables, TKind>;
  /** What the caller passes. Pass a schema to validate, or a type argument alone. */
  variables<T>(schema?: StandardSchemaV1<unknown, T>): HttpBuilder<TResponse, T, TKind>;
  /** Accepted under the `query` head only; its argument is `never` elsewhere. */
  cache(config: CacheArg<TKind>): HttpBuilder<TResponse, TVariables, TKind>;
  /**
   * Address the endpoint and finish it.
   *
   * The closure is probed once for its method and path and never executed for
   * its value.
   */
  via(
    probe: HttpProbe<TVariables>,
    options?: HttpEndpointOptions,
  ): HttpEndpoint<TResponse, TVariables, TKind>;
}

/** Builder for an endpoint delivering server-sent events. */
export interface StreamBuilder<TResponse, TVariables>
  extends NeutralMethods<StreamBuilder<TResponse, TVariables>> {
  response<T>(schema?: StandardSchemaV1<unknown, T>): StreamBuilder<T, TVariables>;
  variables<T>(schema?: StandardSchemaV1<unknown, T>): StreamBuilder<TResponse, T>;
  via(
    probe: StreamProbe<TVariables>,
    options?: StreamEndpointOptions,
  ): StreamEndpoint<TResponse, TVariables>;
}

/**
 * Builder for a bidirectional endpoint over a socket.
 *
 * Leaving `.send()` unused keeps `TSend` as `never`, which makes the resulting
 * channel receive-only without needing a separate kind.
 */
export interface ChannelBuilder<TResponse, TVariables, TSend>
  extends NeutralMethods<ChannelBuilder<TResponse, TVariables, TSend>> {
  /** What the caller receives on the channel. */
  response<T>(schema?: StandardSchemaV1<unknown, T>): ChannelBuilder<T, TVariables, TSend>;
  variables<T>(schema?: StandardSchemaV1<unknown, T>): ChannelBuilder<TResponse, T, TSend>;
  /** What the caller may send on the channel. */
  send<T>(schema?: StandardSchemaV1<unknown, T>): ChannelBuilder<TResponse, TVariables, T>;
  via(
    probe: ChannelProbe<TVariables>,
    options?: ChannelEndpointOptions,
  ): ChannelEndpoint<TResponse, TVariables, TSend>;
}

/** Configuration shared by every endpoint built from a base. */
export interface BaseConfig {
  /** Identifier used by tooling to attribute endpoints to their source. */
  id?: string;
  middleware?: readonly Middleware[];
  allowedHeaders?: readonly string[];
  timeout?: number;
  retry?: RetryOptions;
  meta?: Record<string, unknown>;
}

/**
 * The four builder heads plus the means to derive a narrower base.
 *
 * The head declares an endpoint's semantics in the leftmost position, which is
 * what decides the verb the proxy uses on the wire.
 */
export interface Base {
  /** A read. Travels over GET through the proxy and stays cacheable. */
  readonly query: HttpBuilder<void, void, "query">;
  /** A write. Travels over POST through the proxy. */
  readonly mutation: HttpBuilder<void, void, "mutation">;
  /** A one-way stream of server-sent events. */
  readonly stream: StreamBuilder<void, void>;
  /** A socket the caller can also send on. */
  readonly channel: ChannelBuilder<void, void, never>;
  /**
   * Derive a base from this one.
   *
   * Middleware and header lists are concatenated with this base's first;
   * every other value is replaced.
   */
  extend(config: BaseConfig): Base;
}
