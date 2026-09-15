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
  | "SOURCES_NOT_REGISTERED";

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
  }
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}
