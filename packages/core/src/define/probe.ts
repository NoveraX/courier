import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";

/**
 * Opaque result of a wire call.
 *
 * The closure describing an endpoint is never executed for its value — it is
 * invoked once against a recording proxy — so relating this to the response
 * type would cost a structural comparison per endpoint and buy no safety.
 */
declare const WIRE: unique symbol;

export interface WireCall {
  readonly [WIRE]: true;
}

/** Wire surface offered to an HTTP endpoint's closure. */
export interface HttpWire {
  get(path?: string, variables?: unknown): WireCall;
  post(path?: string, body?: unknown): WireCall;
  put(path?: string, body?: unknown): WireCall;
  patch(path?: string, body?: unknown): WireCall;
  del(path?: string, variables?: unknown): WireCall;
  head(path?: string, variables?: unknown): WireCall;
}

/** Wire surface offered to a server-sent-events endpoint's closure. */
export interface StreamWire {
  get(path?: string, variables?: unknown): WireCall;
}

/** Wire surface offered to a channel endpoint's closure. */
export interface ChannelWire {
  connect(path?: string, variables?: unknown): WireCall;
}

export type HttpProbe<TVariables> = (http: HttpWire, variables: TVariables) => WireCall;
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
 * Recover the wire shape of an endpoint by running its closure once against a
 * recording proxy.
 *
 * The closure is expected to make exactly one call. Anything it does with the
 * returned value is irrelevant, so a throw is treated as success provided a
 * call was already recorded.
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
  let method: string | undefined;
  let path: string | undefined;

  const recorder = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== "string") return undefined;
        return (...args: unknown[]): unknown => {
          // A closure may chain several calls; the first one addresses the endpoint.
          if (method === undefined) {
            method = property === "connect" ? CHANNEL_METHOD : property;
            path = typeof args[0] === "string" ? args[0] : "";
          }
          return {};
        };
      },
    },
  );

  try {
    (probe as (wire: unknown, variables: unknown) => unknown)(recorder, {});
  } catch {
    // Variables are absent while probing, so a closure that reads them throws
    // after the addressing call has already been recorded.
  }

  if (method === undefined || path === undefined) {
    throw new ConfigurationError(
      "ENDPOINT_NO_WIRE_CALL",
      '[courier] endpoint closure made no wire call — it must call exactly one of the wire methods, for example (http, vars) => http.get(":id", vars)',
    );
  }

  return { method: method as HttpMethod, path };
}
