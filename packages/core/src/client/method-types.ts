import type {
  AnyEndpoint,
  InferKind,
  InferResponse,
  InferSend,
  InferVariables,
} from "../define/marker";
import type { CallOptions, HttpResponse } from "../http-client/types";
import type { SSESubscription, WSChannel } from "../realtime/types";

/** Options for .with() — all CallOptions except rawData (controlled via .raw) */
export type WithOptions = Omit<CallOptions, "rawData">;

/**
 * Whether calls stream after `.with(options)`.
 *
 * `{ stream: true }` switches a client to streaming and `{ stream: false }`
 * back; options that do not mention it leave the client as it was. So does
 * `any`, which is what `ReturnType` substitutes for the options of `.with`.
 */
export type StreamAfter<TOptions, TStream extends boolean> = 0 extends 1 & TOptions
  ? TStream
  : [TOptions] extends [{ stream: true }]
    ? true
    : [TOptions] extends [{ stream: false }]
      ? false
      : TStream;

/**
 * What an HTTP call resolves to.
 *
 * The parsed body; with `.raw`, the whole response; with `stream: true`, the
 * unread body as a stream — on its own, or inside the response with `.raw`.
 * A streamed call used to be typed as the parsed body while resolving to an
 * envelope, so a working build read `undefined` at runtime.
 */
export type EndpointResult<
  TResponse,
  TRaw extends boolean,
  TStream extends boolean,
> = TStream extends true
  ? TRaw extends true
    ? HttpResponse<ReadableStream<Uint8Array>>
    : ReadableStream<Uint8Array>
  : TRaw extends true
    ? HttpResponse<TResponse>
    : TResponse;

/** Call signature that takes the variables only as far as the schema requires them. */
type Callable<TVariables, TReturn> = [TVariables] extends [undefined | void]
  ? () => TReturn
  : {} extends TVariables
    ? (variables?: TVariables) => TReturn
    : (variables: TVariables) => TReturn;

/** Typed method signature — adapts based on whether variables are required */
export type EndpointMethod<
  TResponse,
  TVariables,
  TRaw extends boolean,
  TStream extends boolean = false,
> = Callable<TVariables, Promise<EndpointResult<TResponse, TRaw, TStream>>>;

/** SSE subscription method — returns SSESubscription (not Promise) */
export type SSEMethod<TResponse, TVariables> = Callable<TVariables, SSESubscription<TResponse>>;

/** WS channel method — returns WSChannel (not Promise) */
export type WSChannelMethod<TResponse, TReceive, TVariables> = Callable<
  TVariables,
  WSChannel<TReceive, TResponse>
>;

/**
 * Method type for an endpoint descriptor.
 *
 * Dispatches on the declared kind through indexed access, so adding a slot to
 * an endpoint never changes how its call signature is resolved.
 */
type DescriptorMethod<
  TEndpoint extends AnyEndpoint,
  TRaw extends boolean,
  TStream extends boolean,
> =
  InferKind<TEndpoint> extends "stream"
    ? SSEMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>>
    : InferKind<TEndpoint> extends "channel"
      ? WSChannelMethod<InferResponse<TEndpoint>, InferSend<TEndpoint>, InferVariables<TEndpoint>>
      : EndpointMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>, TRaw, TStream>;

/** Resolve the method type an endpoint exposes on a group client. */
export type ResolveMethod<
  TEndpoint,
  TRaw extends boolean,
  TStream extends boolean,
> = TEndpoint extends AnyEndpoint ? DescriptorMethod<TEndpoint, TRaw, TStream> : never;
