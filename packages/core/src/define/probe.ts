import type { HttpMethod, MethodOptions } from "../http-client/types";
import type { PathWriter } from "./path-tag";
import { standIn } from "./stand-in";
import { recordWireCall } from "./wire-call";

/**
 * Opaque result of a wire call, marked with the kind of the verb that made
 * it: `"query"` for a verb that reads, `"mutation"` for one that writes. The
 * mark is what lets an endpoint addressed with `.via()` read or write as the
 * verb its closure calls does.
 *
 * As the endpoint is defined, its closure runs against a recorder and what it
 * returns is dropped; on a call, it runs against the client and hands back
 * the request the wire made. The closure only passes on what the wire gave
 * it, so relating this to the response type would cost a structural
 * comparison per endpoint and buy no safety.
 */
declare const WIRE: unique symbol;

/** Whether a verb reads (`"query"`) or writes (`"mutation"`). */
export type WireKind = "query" | "mutation";

export interface WireCall<TKind extends WireKind = WireKind> {
  readonly [WIRE]: TKind;
}

/**
 * Wire surface offered to an HTTP endpoint's closure.
 *
 * Each method mirrors what the client carries out at request time, including
 * the per-call options that follow the variables — `head` takes none, since it
 * sends no body. `path` writes a path with values put into it.
 */
export interface HttpWire extends PathWriter {
  get(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall<"query">;
  post(path?: string, body?: unknown, options?: MethodOptions<"post">): WireCall<"mutation">;
  put(path?: string, body?: unknown, options?: MethodOptions<"put">): WireCall<"mutation">;
  patch(path?: string, body?: unknown, options?: MethodOptions<"patch">): WireCall<"mutation">;
  del(path?: string, variables?: unknown, options?: MethodOptions<"del">): WireCall<"mutation">;
  head(path?: string, options?: MethodOptions<"head">): WireCall<"query">;
  options(
    path?: string,
    variables?: unknown,
    options?: MethodOptions<"options">,
  ): WireCall<"query">;
  /** Ask with a body, as a read: the variables are the question. */
  query(path?: string, body?: unknown, options?: MethodOptions<"query">): WireCall<"query">;
}

/** Wire surface offered to a server-sent-events endpoint's closure. */
export interface StreamWire extends PathWriter {
  get(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall<"query">;
}

/** Wire surface offered to a channel endpoint's closure. */
export interface ChannelWire extends PathWriter {
  connect(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall<"query">;
}

/**
 * An HTTP endpoint's closure. `TCall` is the call it returns, which carries
 * the kind of its verb: a closure typed without one, or one that calls a
 * reading verb on one path and a writing verb on another, leaves its
 * endpoint to name its kind with `.reads()` or `.writes()`.
 */
export type HttpProbe<TVariables, TCall extends WireCall = WireCall> = (
  http: HttpWire,
  variables: TVariables,
) => TCall;
export type StreamProbe<TVariables> = (sse: StreamWire, variables: TVariables) => WireCall;
export type ChannelProbe<TVariables> = (ws: ChannelWire, variables: TVariables) => WireCall;

/** Any wire closure, whatever surface it expects. */
export type AnyProbe = HttpProbe<never> | StreamProbe<never> | ChannelProbe<never>;

/** Wire shape recovered from a closure. */
export interface WireShape {
  readonly method: HttpMethod;
  readonly path: string;
}

const CHANNEL_METHOD: HttpMethod = "get";

/**
 * The request's options an endpoint's closure hands the wire — its body
 * among them, for one that writes it itself — read from one call with
 * stand-ins for its variables, as `probeWire` reads its method and path. A
 * closure that fails before addressing the wire hands nothing.
 *
 * @param probe - the wire closure supplied to a builder terminal
 * @returns the options the closure passed, or `undefined`
 *
 * @example
 * ```ts
 * probeOptions((http, fields) => http.post("charges", undefined, { body: formBody(fields) }));
 * // → { body: URLSearchParams { … } }
 * ```
 */
export function probeOptions(probe: AnyProbe | ((...args: never[]) => unknown)): unknown {
  try {
    return recordWireCall(probe, standIn()).options;
  } catch {
    /* No wire call to read, so nothing to say about its body. */
    return undefined;
  }
}

/**
 * Recover the wire shape of an endpoint by running its closure once against a
 * recording proxy, with stand-ins for the variables it will receive.
 *
 * @param probe - the wire closure supplied to a builder terminal
 * @returns the HTTP method and path the closure addresses
 * @throws ConfigurationError when the closure records no call at all
 *
 * @example
 * ```ts
 * probeWire((http, vars) => http.get(":id", vars));
 * // → { method: "get", path: ":id" }
 * ```
 */
export function probeWire(probe: AnyProbe): WireShape {
  const { name, path } = recordWireCall(probe, standIn());
  return { method: name === "connect" ? CHANNEL_METHOD : name, path };
}
