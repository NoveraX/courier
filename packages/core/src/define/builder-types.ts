import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type {
  ChannelHandlers,
  SSEContext,
  SSEEvent,
  TopicKey,
  WSPushHandler,
} from "../realtime/types";
import type { ChannelEndpoint, HttpEndpoint, StreamEndpoint } from "./call-shapes";
import type {
  CacheArg,
  ChannelEndpointOptions,
  HttpEndpointOptions,
  RetryOptions,
  StreamEndpointOptions,
} from "./options";
import type { CheckedPath, PathParamNames, VariablesForPath, WithPathParams } from "./path-params";
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
  /**
   * Headers this endpoint carries across the proxy: forwarded from the caller
   * to the upstream, and passed back from the upstream's answer to the
   * caller — a `Location`, a `Link`, an `X-Total-Count`. Cookies cross only
   * where named: `cookie` sends the caller's cookies up, `set-cookie` passes
   * the upstream's back. The body's own description (`Content-Type`,
   * `Content-Length`, `Content-Encoding`) is never taken from this list.
   *
   * @example
   * ```ts
   * login: endpoint.post("login").headers(["set-cookie"]),
   * me: endpoint.get("me").headers(["cookie"]),
   * ```
   */
  headers(names: readonly string[]): TSelf;
  timeout(ms: number): TSelf;
  /** Retry policy; an endpoint that writes is retried only with `mutations: true`. */
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
 *
 * A path's `:name` parameters are taken from the variables. Declared before
 * the path, the variables must name each of them; left undeclared, the
 * variables are the parameters, each one required.
 *
 * @example
 * ```ts
 * endpoint.get("users/:id"); // variables: { id: string | number }
 * endpoint.variables<{ id: string }>().get("users/:id");
 * // @ts-expect-error — the variables do not name :id
 * endpoint.variables<{ slug: string }>().get("users/:id");
 * ```
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
  get<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "query">;
  /** Read its headers alone. */
  head<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "query">;
  /** Ask what it allows. */
  options<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "query">;
  /** Create it. */
  post<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "mutation">;
  /** Replace it. */
  put<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "mutation">;
  /** Change part of it. */
  patch<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "mutation">;
  /** Remove it. */
  del<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: HttpEndpointOptions,
  ): HttpAddressedAt<TVariables, TVariablesOut, TPath, "mutation">;

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
  TParams extends string = never,
> extends HttpEndpoint<TResponse, TVariables, TKind, TVariablesOut>,
    NeutralMethods<HttpAddressed<TResponse, TVariables, TVariablesOut, TKind, TParams>> {
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): HttpAddressed<T, TVariables, TVariablesOut, TKind, TParams>;
  /**
   * What the caller passes. Each of the path's `:name` parameters is taken
   * from it, so variables that leave one out are refused here.
   */
  variables<TIn, TOut = TIn>(
    ...schema: WithPathParams<TParams, TIn, [schema?: StandardSchemaV1<TIn, TOut>]>
  ): HttpAddressed<TResponse, TIn, TOut, TKind, TParams>;
  /**
   * How long the answer keeps.
   *
   * Offered on a read alone: its argument is `never` once the verb writes, so
   * caching a write fails where it was written.
   */
  cache(
    config: CacheArg<TKind>,
  ): HttpAddressed<TResponse, TVariables, TVariablesOut, TKind, TParams>;
  /**
   * Declare a write-shaped call to be a read.
   *
   * Some APIs answer a search or a report over POST. Saying so makes the
   * endpoint a query: it may be cached, the query hooks accept it, and the
   * proxy will serve it over GET. An endpoint addressed with `.put()`,
   * `.patch()` or `.del()` changes what it addresses and is refused with
   * `READS_ON_CHANGING_VERB`.
   */
  reads(): HttpAddressed<TResponse, TVariables, TVariablesOut, "query", TParams>;
}

/** What naming a verb and a path gives: the endpoint, with its path's parameters. */
export type HttpAddressedAt<
  TVariables,
  TVariablesOut,
  TPath extends string,
  TKind extends "query" | "mutation",
> = HttpAddressed<
  void,
  VariablesForPath<TVariables, TPath>,
  VariablesForPath<TVariablesOut, TPath>,
  TKind,
  PathParamNames<TPath>
>;

/** Builder for an endpoint delivering server-sent events. */
export interface StreamBuilder<TResponse, TVariables, TVariablesOut>
  extends NeutralMethods<StreamBuilder<TResponse, TVariables, TVariablesOut>> {
  response<T>(schema?: StandardSchemaV1<unknown, T>): StreamBuilder<T, TVariables, TVariablesOut>;
  variables<TIn, TOut = TIn>(
    schema?: StandardSchemaV1<TIn, TOut>,
  ): StreamBuilder<TResponse, TIn, TOut>;
  /** Where the stream is, when another process serves it; see `HttpBuilder` for its path's parameters. */
  get<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: StreamEndpointOptions,
  ): StreamAddressed<
    TResponse,
    VariablesForPath<TVariables, TPath>,
    VariablesForPath<TVariablesOut, TPath>,
    PathParamNames<TPath>
  >;
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
   *
   * The stream closes when its client leaves, when it is disconnected and
   * when the server shuts down, without waiting for the generator. A
   * generator waiting on an event that may never come should release what it
   * holds when `ctx.signal` fires; otherwise its `finally` runs only the next
   * time it yields.
   *
   * @example
   * ```ts
   * stream.response<Tick>().implement(async function* (ctx) {
   *   const feed = subscribe();
   *   ctx.signal.addEventListener("abort", () => feed.close());
   *   for await (const tick of feed) yield { data: tick };
   * });
   * ```
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
  /**
   * What the channel's subscribers share a topic by, when it is not all of
   * their variables.
   *
   * Subscribers whose key is equal are on one topic, so
   * `ctx.broadcast(ctx.topic, …)` reaches every one of them, while each
   * keeps its own variables in `ctx.variables`. Without a key, every
   * distinct set of variables is a topic of its own. The key is read from
   * the variables as the schema produced them.
   *
   * On one connection, subscriptions whose key is equal are one
   * subscription: the newer subscribe replaces the older, whose `onLeave`
   * runs. It applies to a channel this process serves, so it is named
   * before `.implement()`.
   *
   * @param key - Reads the topic key from a subscriber's variables
   * @returns The builder, keyed
   *
   * @example
   * ```ts
   * channel
   *   .variables(z.object({ room: z.string(), nick: z.string() }))
   *   .topic((v) => ({ room: v.room }))
   *   .implement((v) => ({
   *     onMessage: (ctx, m) => ctx.broadcast(ctx.topic, { from: v.nick, text: m.text }),
   *   }));
   * ```
   */
  topic(
    key: (variables: TVariablesOut) => TopicKey,
  ): ChannelBuilder<TResponse, TVariables, TVariablesOut, TSend>;
  /** Where the channel is, when another process serves it; see `HttpBuilder` for its path's parameters. */
  connect<TPath extends string = "">(
    path?: CheckedPath<TPath, TVariables>,
    options?: ChannelEndpointOptions,
  ): ChannelAddressed<
    TResponse,
    VariablesForPath<TVariables, TPath>,
    VariablesForPath<TVariablesOut, TPath>,
    TSend,
    PathParamNames<TPath>
  >;
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
export interface StreamAddressed<
  TResponse,
  TVariables,
  TVariablesOut,
  TParams extends string = never,
> extends StreamEndpoint<TResponse, TVariables, TVariablesOut>,
    NeutralMethods<StreamAddressed<TResponse, TVariables, TVariablesOut, TParams>> {
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): StreamAddressed<T, TVariables, TVariablesOut, TParams>;
  /** What the caller passes; it names each of the path's `:name` parameters. */
  variables<TIn, TOut = TIn>(
    ...schema: WithPathParams<TParams, TIn, [schema?: StandardSchemaV1<TIn, TOut>]>
  ): StreamAddressed<TResponse, TIn, TOut, TParams>;
}

/** A channel that has said where it is, and may still be refined. */
export interface ChannelAddressed<
  TResponse,
  TVariables,
  TVariablesOut,
  TSend,
  TParams extends string = never,
> extends ChannelEndpoint<TResponse, TVariables, TSend, TVariablesOut>,
    NeutralMethods<ChannelAddressed<TResponse, TVariables, TVariablesOut, TSend, TParams>> {
  response<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelAddressed<T, TVariables, TVariablesOut, TSend, TParams>;
  /** What the caller passes; it names each of the path's `:name` parameters. */
  variables<TIn, TOut = TIn>(
    ...schema: WithPathParams<TParams, TIn, [schema?: StandardSchemaV1<TIn, TOut>]>
  ): ChannelAddressed<TResponse, TIn, TOut, TSend, TParams>;
  send<T>(
    schema?: StandardSchemaV1<unknown, T>,
  ): ChannelAddressed<TResponse, TVariables, TVariablesOut, T, TParams>;
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
