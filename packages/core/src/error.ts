import type { HttpResponse } from "./http-client/types";

export class HTTPError<TData = unknown> extends Error {
  status: number;
  headers: Headers;
  data: TData;

  constructor(response: HttpResponse<TData>) {
    super(response.status > 0 ? `HTTP ${response.status}` : "Network request failed");
    this.name = "HTTPError";

    this.status = response.status;
    this.headers = response.headers;
    this.data = response.data;
  }
}

export function isHTTPError<TData = unknown>(error: unknown): error is HTTPError<TData> {
  return error instanceof HTTPError;
}

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
   * Studio Playground proxy mode tried to open a real network connection from
   * the user-app process, but `appOrigin` was neither passed to
   * `connectStudio` / `instrumentServer` nor discoverable from environment
   * variables (`NEXUS_APP_URL` or fallback `APP_URL`). Without an origin,
   * relative `proxyPath` values cannot be resolved into absolute URLs.
   */
  | "APP_ORIGIN_NOT_CONFIGURED"
  /**
   * Node runtime older than v21 lacks the global `WebSocket` constructor that
   * Studio Playground proxy mode WS executor relies on. Surface this loudly
   * instead of producing a `ReferenceError` deep inside the connection loop.
   */
  | "NODE_WEBSOCKET_UNAVAILABLE";

/**
 * Thrown when nexus is misconfigured at the boundary between user code and
 * the runtime — e.g. an endpoint requires a transport whose proxy path is
 * missing, or a relative path was given in an environment with no origin.
 *
 * The `code` field is the stable discriminator; the `message` is a
 * human-readable explanation that may include remediation hints.
 */
export class ConfigurationError extends Error {
  readonly code: ConfigurationErrorCode;

  constructor(code: ConfigurationErrorCode, message: string) {
    super(message);
    this.name = "ConfigurationError";
    this.code = code;
  }
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}
