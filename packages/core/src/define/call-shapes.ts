import type { CallOptions } from "../http-client/types";
import type { SSESubscription, WSChannel } from "../realtime/types";
import type { Endpoint, EndpointTypes } from "./marker";

/**
 * Leading parameters of a call.
 *
 * An endpoint that declared no variables takes none, so `getAll()` stays
 * shorter than `getAll(undefined)`. Evaluated once when the terminal stamps
 * the call shape rather than on every access through a caller.
 */
export type Arg<TVariables> = [TVariables] extends [void] ? [] : [variables: TVariables];

export type HttpCall<TResponse, TVariables> = (
  ...args: [...Arg<TVariables>, options?: CallOptions]
) => Promise<TResponse>;

export type StreamCall<TResponse, TVariables> = (
  ...args: [...Arg<TVariables>, options?: CallOptions]
) => SSESubscription<TResponse>;

export type ChannelCall<TResponse, TVariables, TSend> = (
  ...args: [...Arg<TVariables>, options?: CallOptions]
) => WSChannel<TSend, TResponse>;

/**
 * An endpoint reached over HTTP.
 *
 * `TKind` decides the proxy verb: a query travels over GET and stays
 * cacheable, a mutation travels over POST.
 */
export type HttpEndpoint<TResponse, TVariables, TKind extends "query" | "mutation"> = Endpoint<
  EndpointTypes<TResponse, TVariables, never, HttpCall<TResponse, TVariables>, TKind>
>;

/** An endpoint delivering server-sent events. */
export type StreamEndpoint<TResponse, TVariables> = Endpoint<
  EndpointTypes<TResponse, TVariables, never, StreamCall<TResponse, TVariables>, "stream">
>;

/**
 * A bidirectional endpoint over a socket.
 *
 * A push-only endpoint is this with `TSend` left as `never`, which makes
 * `send` uncallable rather than requiring a separate kind.
 */
export type ChannelEndpoint<TResponse, TVariables, TSend> = Endpoint<
  EndpointTypes<TResponse, TVariables, TSend, ChannelCall<TResponse, TVariables, TSend>, "channel">
>;
