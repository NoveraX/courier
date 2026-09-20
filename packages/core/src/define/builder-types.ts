import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type { ChannelHandlers, SSEContext, SSEEvent, WSPushHandler } from "../realtime/types";
import type { ChannelEndpoint, HttpEndpoint, StreamEndpoint } from "./call-shapes";
import type {
  CacheArg,
  ChannelEndpointOptions,
  HttpEndpointOptions,
  RetryOptions,
  StreamEndpointOptions,
} from "./options";
import type { ChannelProbe, HttpProbe, StreamProbe } from "./probe";

/** Generator serving a stream from the defining process. */
export type StreamHandler<TResponse, TVariables> = (
  context: SSEContext<TVariables>,
) => AsyncGenerator<SSEEvent<TResponse>, void, unknown>;

/**
 * Implementation serving a channel the caller can send on.
 *
 * It receives the variables the subscription carried and returns a handler for
 * each direction.
 */
export type ChannelDuplexHandler<TResponse, TVariables, TSend> = (
  variables: TVariables,
) => ChannelHandlers<TSend, TResponse, TVariables>;

/** Implementation serving a channel that only pushes. */
export type ChannelPushHandler<TResponse, TVariables> = WSPushHandler<TResponse, TVariables>;

/**
 * The implementation a channel takes, decided by whether it can be sent on.
 *
 * `TSend` is `never` until `.send()` names what the caller may send, so the
 * two shapes never have to be told apart from the handler itself.
 */
export type ChannelImplementation<TResponse, TVariables, TSend> = [TSend] extends [never]
  ? ChannelPushHandler<TResponse, TVariables>
  : ChannelDuplexHandler<TResponse, TVariables, TSend>;

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
export interface HttpBuilder<
  TResponse,
  TVariables,
  TVariablesOut,
  TKind extends "query" | "mutation",
> extends NeutralMethods<HttpBuilder<TResponse, TVariables, TVariablesOut, TKind>> {
  /** What the caller receives. Pass a schema to validate, or a type argument alone. */
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): HttpBuilder<T, TVariables, TVariablesOut, TKind>;
  /**
   * What the caller passes. Pass a schema to validate, or a type argument alone.
   *
   * A schema may accept less than it produces — a field it defaults, a value it
   * coerces — so the caller satisfies its input while the closure receives its
   * output.
   */
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): HttpBuilder<TResponse, TIn, TOut, TKind>;
  /** Accepted under the `query` head only; its argument is `never` elsewhere. */
  cache(config: CacheArg<TKind>): HttpBuilder<TResponse, TVariables, TVariablesOut, TKind>;
  /**
   * Address the endpoint and finish it.
   *
   * The closure is probed once for its method and path and never executed for
   * its value.
   */
  via(
    probe: HttpProbe<TVariablesOut>,
    options?: HttpEndpointOptions,
  ): HttpEndpoint<TResponse, TVariables, TKind, TVariablesOut>;
}

/** Builder for an endpoint delivering server-sent events. */
export interface StreamBuilder<TResponse, TVariables, TVariablesOut>
  extends NeutralMethods<StreamBuilder<TResponse, TVariables, TVariablesOut>> {
  response<T>(schema?: StandardSchemaV1<unknown, T>): StreamBuilder<T, TVariables, TVariablesOut>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): StreamBuilder<TResponse, TIn, TOut>;
  via(
    probe: StreamProbe<TVariablesOut>,
    options?: StreamEndpointOptions,
  ): StreamEndpoint<TResponse, TVariables, TVariablesOut>;
  /**
   * Serve this stream from the process that defines it.
   *
   * Finishes the chain the same way `via` does, but carries the generator
   * producing the events instead of the address of a remote stream.
   */
  implement(
    handler: StreamHandler<TResponse, TVariablesOut>,
    options?: StreamEndpointOptions,
  ): StreamEndpoint<TResponse, TVariables, TVariablesOut>;
}

/**
 * Builder for a bidirectional endpoint over a socket.
 *
 * Leaving `.send()` unused keeps `TSend` as `never`, which makes the resulting
 * channel receive-only without needing a separate kind.
 */
export interface ChannelBuilder<TResponse, TVariables, TVariablesOut, TSend>
  extends NeutralMethods<ChannelBuilder<TResponse, TVariables, TVariablesOut, TSend>> {
  /** What the caller receives on the channel. */
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelBuilder<T, TVariables, TVariablesOut, TSend>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): ChannelBuilder<TResponse, TIn, TOut, TSend>;
  /** What the caller may send on the channel. */
  send<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelBuilder<TResponse, TVariables, TVariablesOut, T>;
  via(
    probe: ChannelProbe<TVariablesOut>,
    options?: ChannelEndpointOptions,
  ): ChannelEndpoint<TResponse, TVariables, TSend, TVariablesOut>;
  /**
   * Serve this channel from the process that defines it.
   *
   * Which implementation it takes follows from `.send()`: a channel nothing
   * can send on is served by the generator producing what it pushes, and one
   * that accepts messages is served by a handler for each direction.
   *
   * The two are selected by a conditional type rather than offered as a union
   * or as overloads. Both of those leave an inline handler without a
   * contextual type, which would silently widen every one of its parameters
   * to `any`.
   */
  implement(
    handler: ChannelImplementation<TResponse, TVariablesOut, TSend>,
    options?: ChannelEndpointOptions,
  ): ChannelEndpoint<TResponse, TVariables, TSend, TVariablesOut>;
}

/** Configuration shared by every endpoint built from a base. */
export interface CourierConfig {
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
 * what decides the verbs the proxy will serve it over.
 */
export interface Courier {
  /**
   * A read. It is the only kind the proxy will serve over GET, which is what
   * makes it cacheable — a call asks for that verb with `method: "GET"`.
   */
  readonly query: HttpBuilder<void, void, void, "query">;
  /** A write. The proxy serves it over POST alone, and refuses a GET. */
  readonly mutation: HttpBuilder<void, void, void, "mutation">;
  /** A one-way stream of server-sent events. */
  readonly stream: StreamBuilder<void, void, void>;
  /** A socket the caller can also send on. */
  readonly channel: ChannelBuilder<void, void, void, never>;
  /**
   * Derive a base from this one.
   *
   * Middleware and header lists are concatenated with this base's first;
   * every other value is replaced.
   */
  extend(config: CourierConfig): Courier;
}
