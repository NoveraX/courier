import type { Endpoint, EndpointTypes } from "./marker";

/**
 * An endpoint reached over HTTP.
 *
 * `TKind` decides which proxy verbs the endpoint will answer: a query may be
 * fetched over GET and cached, a mutation only over POST. Which verb a call
 * actually uses is the caller's to choose.
 */
export type HttpEndpoint<
  TResponse,
  TVariables,
  TKind extends "query" | "mutation",
  TVariablesOut = TVariables,
> = Endpoint<EndpointTypes<TResponse, TVariables, TVariablesOut, never, TKind>>;

/** An endpoint delivering server-sent events. */
export type StreamEndpoint<TResponse, TVariables, TVariablesOut = TVariables> = Endpoint<
  EndpointTypes<TResponse, TVariables, TVariablesOut, never, "stream">
>;

/**
 * A bidirectional endpoint over a socket.
 *
 * A push-only endpoint is this with `TSend` left as `never`, which makes
 * `send` uncallable rather than requiring a separate kind.
 */
export type ChannelEndpoint<TResponse, TVariables, TSend, TVariablesOut = TVariables> = Endpoint<
  EndpointTypes<TResponse, TVariables, TVariablesOut, TSend, "channel">
>;
