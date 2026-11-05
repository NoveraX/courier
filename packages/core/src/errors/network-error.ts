import { CourierError } from "./courier-error";

/**
 * Thrown when a request got no answer: its host could not be resolved or
 * reached, the connection was refused, reset or closed before the answer
 * was whole, or the server's certificate was refused. An answer of any
 * status, however unwelcome, is an `HTTPError` instead.
 *
 * Its message names the platform's code and nothing else — no host, no
 * address — so it is safe to show; what the platform said is its `cause`.
 *
 * @example
 * ```ts
 * try {
 *   await api.users.list();
 * } catch (error) {
 *   if (isNetworkError(error)) showOffline(error.systemCode); // "ECONNREFUSED", or undefined in a browser
 * }
 * ```
 */
export class NetworkError extends CourierError<"NETWORK_ERROR"> {
  /**
   * The platform's code for the failure, where it gave one — `ECONNREFUSED`,
   * `ENOTFOUND`, `UND_ERR_SOCKET`, `CERT_HAS_EXPIRED`; a browser gives none.
   */
  readonly systemCode: string | undefined;

  /**
   * @param options - What the platform rejected with, and the code it gave
   */
  constructor(options: { cause?: unknown; systemCode?: string | undefined } = {}) {
    const { cause, systemCode } = options;
    super(
      systemCode === undefined
        ? "Network request failed"
        : `Network request failed (${systemCode})`,
      {
        code: "NETWORK_ERROR",
        cause,
      },
    );
    this.name = "NetworkError";
    this.systemCode = systemCode;
  }
}

/** Type guard for `NetworkError`. */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
