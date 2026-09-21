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
 * An HTTP endpoint that has not yet said where it is.
 *
 * It offers the verbs and nothing that describes an answer, because until a
 * verb has been named there is no telling whether the endpoint has one. Naming
 * a verb moves the chain to its addressed half, where the rest is described.
 *
 * `.variables()` is the one exception, and only for `.via()`: a closure has to
 * know what it will be handed.
 */
export interface HttpBuilder<TVariables, TVariablesOut>
  extends NeutralMethods<HttpBuilder<TVariables, TVariablesOut>> {
  /**
   * What the caller passes, for a closure that has to work it into the call.
   *
   * A schema may accept less than it produces — a field it defaults, a value
   * it coerces — so the caller satisfies its input while the endpoint receives
   * its output.
   */
  variables<TIn, TOut = TIn>(schema?: StandardSchemaV1<TIn, TOut>): HttpBuilder<TIn, TOut>;

  /** Read it. */
  get(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "query">;
  /** Read its headers alone. */
  head(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "query">;
  /** Create it. */
  post(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "mutation">;
  /** Replace it. */
  put(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "mutation">;
  /** Change part of it. */
  patch(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "mutation">;
  /** Remove it. */
  del(
    path?: string,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "mutation">;

  /**
   * Address it with a closure, for a path or a body the variables have to be
   * worked into.
   *
   * The closure hides which verb it calls, so the endpoint is taken to write;
   * `.reads()` says otherwise. It is invoked once for its method and path and
   * never executed for its value.
   */
  via(
    probe: HttpProbe<TVariablesOut>,
    options?: HttpEndpointOptions,
  ): HttpAddressed<void, TVariables, TVariablesOut, "mutation">;
}

/**
 * An HTTP endpoint that has said where it is.
 *
 * It is a finished endpoint and a builder at once: every consumer may read it
 * as it stands, and naming a schema or an option returns another one.
 */
export interface HttpAddressed<
  TResponse,
  TVariables,
  TVariablesOut,
  TKind extends "query" | "mutation",
> extends HttpEndpoint<TResponse, TVariables, TKind, TVariablesOut>,
    NeutralMethods<HttpAddressed<TResponse, TVariables, TVariablesOut, TKind>> {
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): HttpAddressed<T, TVariables, TVariablesOut, TKind>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): HttpAddressed<TResponse, TIn, TOut, TKind>;
  /**
   * How long the answer keeps.
   *
   * Offered on a read alone: its argument is `never` once the verb writes, so
   * caching a write fails where it was written.
   */
  cache(config: CacheArg<TKind>): HttpAddressed<TResponse, TVariables, TVariablesOut, TKind>;
  /**
   * Declare a write-shaped call to be a read.
   *
   * Some APIs answer a search or a report over POST. Saying so makes the
   * endpoint a query: it may be cached, the query hooks accept it, and the
   * proxy will serve it over GET.
   */
  reads(): HttpAddressed<TResponse, TVariables, TVariablesOut, "query">;
}

/** Builder for an endpoint delivering server-sent events. */
export interface StreamBuilder<TResponse, TVariables, TVariablesOut>
  extends NeutralMethods<StreamBuilder<TResponse, TVariables, TVariablesOut>> {
  response<T>(schema?: StandardSchemaV1<unknown, T>): StreamBuilder<T, TVariables, TVariablesOut>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): StreamBuilder<TResponse, TIn, TOut>;
  /** Where the stream is, when another process serves it. */
  get(
    path?: string,
    options?: StreamEndpointOptions,
  ): StreamAddressed<TResponse, TVariables, TVariablesOut>;
  /** Address it with a closure, for a path the variables have to be worked into. */
  via(
    probe: StreamProbe<TVariablesOut>,
    options?: StreamEndpointOptions,
  ): StreamAddressed<TResponse, TVariables, TVariablesOut>;
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
  /** Where the channel is, when another process serves it. */
  connect(
    path?: string,
    options?: ChannelEndpointOptions,
  ): ChannelAddressed<TResponse, TVariables, TVariablesOut, TSend>;
  /** Address it with a closure, for a path the variables have to be worked into. */
  via(
    probe: ChannelProbe<TVariablesOut>,
    options?: ChannelEndpointOptions,
  ): ChannelAddressed<TResponse, TVariables, TVariablesOut, TSend>;
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

/** A stream that has said where it is, and may still be refined. */
export interface StreamAddressed<TResponse, TVariables, TVariablesOut>
  extends StreamEndpoint<TResponse, TVariables, TVariablesOut>,
    NeutralMethods<StreamAddressed<TResponse, TVariables, TVariablesOut>> {
  response<T>(schema?: StandardSchemaV1<unknown, T>): StreamAddressed<T, TVariables, TVariablesOut>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): StreamAddressed<TResponse, TIn, TOut>;
}

/** A channel that has said where it is, and may still be refined. */
export interface ChannelAddressed<TResponse, TVariables, TVariablesOut, TSend>
  extends ChannelEndpoint<TResponse, TVariables, TSend, TVariablesOut>,
    NeutralMethods<ChannelAddressed<TResponse, TVariables, TVariablesOut, TSend>> {
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelAddressed<T, TVariables, TVariablesOut, TSend>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): ChannelAddressed<TResponse, TIn, TOut, TSend>;
  send<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelAddressed<TResponse, TVariables, TVariablesOut, T>;
}

/** Configuration shared by every endpoint built from a base. */
export interface CourierBaseConfig {
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
 * An HTTP endpoint is finished by its verb, which is what says whether it reads
 * or writes; a stream and a channel are their own kinds, because their
 * transport is what sets them apart rather than a verb.
 */
export interface Courier {
  /**
   * An endpoint reached over HTTP. The verb that finishes the chain decides
   * whether it reads or writes.
   */
  readonly endpoint: HttpBuilder<void, void>;
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
  extend(config: CourierBaseConfig): Courier;
}
