import { CourierError } from "./courier-error";

/**
 * Discriminator string for configuration errors. New codes must be added here
 * (and only here) so the union stays exhaustive across `instanceof` callers.
 */
export type ConfigurationErrorCode =
  /** A WebSocket endpoint was invoked but `proxyPath.ws` was not configured. */
  | "WS_PATH_NOT_CONFIGURED"
  /** A relative `proxyPath` value was given but no origin is available (SSR without explicit origin injection). */
  | "PROXY_PATH_NO_ORIGIN"
  /** A `proxyPath` value is malformed (empty string, protocol-relative `//host`, wrong scheme, etc.). */
  | "PROXY_PATH_INVALID"
  /**
   * A proxy call set an option only the server may decide — `prefixUrl`,
   * which would choose where the server's own request goes.
   */
  | "PROXY_OPTION_NOT_ALLOWED"
  /**
   * A proxy call's variables were a raw body — a Blob, bytes, a stream or
   * URLSearchParams. The proxy carries variables as JSON or as FormData, and
   * the server decides what the upstream request looks like.
   */
  | "PROXY_BODY_NOT_SUPPORTED"
  /**
   * A stream endpoint sent an event whose name starts with `courier:` —
   * reserved for the events that tell the client how the stream ended.
   */
  | "RESERVED_SSE_EVENT"
  /**
   * Studio Playground proxy mode tried to open a real network connection
   * from the user-app process, but `appOrigin` was not configured. Set it
   * via `courier.config.ts.runtime.appOrigin` or the `COURIER_APP_URL` /
   * `APP_URL` environment variables. Without an origin, relative
   * `proxyPath` values cannot be resolved into absolute URLs.
   */
  | "APP_ORIGIN_NOT_CONFIGURED"
  /**
   * Node runtime older than v21 lacks the global `WebSocket` constructor that
   * Studio Playground proxy mode WS executor relies on. Surface this loudly
   * instead of producing a `ReferenceError` deep inside the connection loop.
   */
  | "NODE_WEBSOCKET_UNAVAILABLE"
  /**
   * A framework adapter handler (`courierHandler`, `apiRoute`, …) was invoked
   * before any sources had been registered. Indicates the user forgot to
   * `await attachRuntime()` in their instrumentation entry point — the
   * adapter reads sources lazily from the core global registry and has
   * nothing to resolve against.
   */
  | "SOURCES_NOT_REGISTERED"
  /**
   * `registerSources` was handed something that is not a dictionary of
   * sources. Registering it would leave every later `requireSources()` call
   * answering with a value no adapter can address, far from the mistake.
   */
  | "SOURCES_NOT_A_RECORD"
  /**
   * A source was registered under a key other than the name its author gave
   * `defineApi`. A browser client addresses the source by the name on its own
   * copy of the definition, while the server resolves the key, so every call
   * by that name would be refused.
   */
  | "SOURCE_KEY_MISMATCH"
  /**
   * A source carries a boundary declared for another source. The server
   * would gate this source on a list of the other's endpoints, while the
   * browser addresses the other by name.
   */
  | "BOUNDARY_SOURCE_MISMATCH"
  /**
   * Something read the request body before the proxy route did — almost
   * always a body-parsing middleware mounted across the whole application.
   * The stream is gone by then, and the platform's own error says only that
   * it is "disturbed or locked".
   */
  | "REQUEST_BODY_ALREADY_READ"
  /**
   * A WebSocket route handler was called as an ordinary HTTP handler — the
   * framework's WebSocket plugin, such as `@fastify/websocket`, is not
   * registered, so no socket was ever opened.
   */
  | "WEBSOCKET_PLUGIN_MISSING"
  /**
   * An endpoint's wire closure recorded no call, so its method and path could
   * not be determined. The closure must address the endpoint exactly once,
   * for example `(http, vars) => http.get(":id", vars)`.
   */
  | "ENDPOINT_NO_WIRE_CALL"
  /**
   * A builder slot was filled twice. Slots replace rather than merge, so a
   * second call is a mistake rather than a refinement and is reported at the
   * definition site instead of silently discarding one of the two values.
   */
  | "SLOT_ALREADY_SET"
  | "CACHE_ON_WRITE"
  /**
   * A channel named `.topic()` and was then addressed with `.connect()` or
   * `.via()`. The server that serves it decides its topics, so the key would
   * be kept and never read.
   */
  | "TOPIC_ON_REMOTE_CHANNEL"
  /**
   * A channel's `.response()` schema validated asynchronously. `ctx.send` and
   * `ctx.broadcast` check what they send as they send it, in order, so the
   * schema has to answer synchronously.
   */
  | "ASYNC_RESPONSE_SCHEMA"
  /**
   * A direct caller — `createCaller`, `createQueryCaller` — was asked to open
   * a stream or channel this process serves with `.implement()`. Its
   * `baseURL` is the upstream's, where nothing serves it; it is reached
   * through a proxy caller and the server that serves it.
   */
  | "DIRECT_CALL_TO_SERVED_ENDPOINT"
  /**
   * An endpoint was named `options` in a group or among a source's own
   * endpoints, where that name holds the group's or the source's settings;
   * or an endpoint or a group was named `raw` or `with`, which a client
   * answers with its own accessors.
   */
  | "RESERVED_ENDPOINT_NAME"
  /**
   * A proxy call's variables hold binary data — a Blob, an ArrayBuffer or a
   * typed array — which JSON cannot carry to the proxy. It belongs in a
   * FormData.
   */
  | "PROXY_VARIABLE_NOT_SERIALIZABLE"
  /** A client built with a boundary was asked for an endpoint the boundary does not expose. */
  | "ENDPOINT_NOT_IN_BOUNDARY"
  /** An endpoint declared as a stream or a channel was called by a client with no transport for it. */
  | "STREAM_TRANSPORT_NOT_CONFIGURED"
  /** `.reads()` was named on an endpoint addressed with a verb that changes what it addresses. */
  | "READS_ON_CHANGING_VERB";

/**
 * Thrown when courier is misconfigured at the boundary between user code and
 * the runtime — e.g. an endpoint requires a transport whose proxy path is
 * missing, or a relative path was given in an environment with no origin.
 *
 * The `code` field is the stable discriminator; the `message` is a
 * human-readable explanation that may include remediation hints.
 */
export class ConfigurationError extends CourierError<ConfigurationErrorCode> {
  constructor(code: ConfigurationErrorCode, message: string) {
    super(message, { code });
    this.name = "ConfigurationError";
  }
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}
