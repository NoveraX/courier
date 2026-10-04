import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod, MethodOptions } from "../http-client/types";

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

/**
 * Wire surface offered to an HTTP endpoint's closure.
 *
 * Each method mirrors what the client carries out at request time, including
 * the per-call options that follow the variables — `head` takes none, since it
 * sends no body.
 */
export interface HttpWire {
  get(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall;
  post(path?: string, body?: unknown, options?: MethodOptions<"post">): WireCall;
  put(path?: string, body?: unknown, options?: MethodOptions<"put">): WireCall;
  patch(path?: string, body?: unknown, options?: MethodOptions<"patch">): WireCall;
  del(path?: string, variables?: unknown, options?: MethodOptions<"del">): WireCall;
  head(path?: string, options?: MethodOptions<"head">): WireCall;
  options(path?: string, variables?: unknown, options?: MethodOptions<"options">): WireCall;
}

/** Wire surface offered to a server-sent-events endpoint's closure. */
export interface StreamWire {
  get(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall;
}

/** Wire surface offered to a channel endpoint's closure. */
export interface ChannelWire {
  connect(path?: string, variables?: unknown, options?: MethodOptions<"get">): WireCall;
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
 * A stand-in for the variables a closure will receive at request time.
 *
 * Probing has no real ones, so this answers every read with another stand-in.
 * Because each is callable and reads as an empty string, a closure may walk
 * into its variables, call methods on them or interpolate them and still reach
 * the call that addresses the endpoint. `then` is left absent so the stand-in
 * is never mistaken for a promise.
 */
function standIn(): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get: (_target, property) => {
      if (property === Symbol.toPrimitive) return () => "";
      if (property === "then") return undefined;
      if (property === Symbol.iterator) return function* (): Generator<unknown> {};
      return proxy;
    },
    has: () => true,
    apply: () => proxy,
  });
  return proxy;
}

/** The call a closure made to address its endpoint. */
export interface WireCallRecord {
  /** The wire method it called — a verb, or `connect` for a channel. */
  readonly name: string;
  readonly path: string;
  /** What it passed after the path. */
  readonly variables: unknown;
}

/**
 * Run a wire closure once against a recording wire and return the call it
 * made to address its endpoint.
 *
 * The closure is expected to make exactly one call. Anything it does with the
 * returned value is irrelevant, so a throw is treated as success provided a
 * call was already recorded.
 *
 * @param probe - the wire closure supplied to a builder terminal
 * @param variables - what the closure is handed as its variables
 * @returns the first call the closure made
 * @throws ConfigurationError when the closure records no call at all
 *
 * @example
 * ```ts
 * recordWireCall((sse, vars) => sse.get(`${vars.room}/feed`), { room: "lobby" });
 * // → { name: "get", path: "lobby/feed", variables: undefined }
 * ```
 */
export function recordWireCall(probe: AnyProbe, variables: unknown): WireCallRecord {
  let recorded: WireCallRecord | undefined;

  const recorder = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== "string") return undefined;
        return (...args: unknown[]): unknown => {
          // A closure may chain several calls; the first one addresses the endpoint.
          recorded ??= {
            name: property,
            path: typeof args[0] === "string" ? args[0] : "",
            variables: args[1],
          };
          return {};
        };
      },
    },
  );

  let thrown: unknown;
  try {
    Reflect.apply(probe, undefined, [recorder, variables]);
  } catch (error) {
    // Real variables may be absent, so a closure may still fail after the
    // addressing call has been recorded. Kept in case it was not.
    thrown = error;
  }

  if (recorded) return recorded;
  if (thrown !== undefined) throw thrown;
  throw new ConfigurationError(
    "ENDPOINT_NO_WIRE_CALL",
    '[courier] endpoint closure made no wire call — it must call exactly one of the wire methods, for example (http, vars) => http.get(":id", vars)',
  );
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
  return { method: (name === "connect" ? CHANNEL_METHOD : name) as HttpMethod, path };
}
