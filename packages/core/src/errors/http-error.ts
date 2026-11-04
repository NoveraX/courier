import type { HttpResponse } from "../http-client/types";
import { CourierError } from "./courier-error";
import { defineNodePrinting } from "./http-error-inspect";

/**
 * Thrown when an HTTP response has a non-2xx status, or when the underlying
 * fetch fails entirely (network error, status === 0). Carries the full
 * response so callers can inspect headers and body without re-fetching.
 *
 * Printed — by `console.error`, a logger, Node's report of an uncaught
 * error — it shows the response's headers with every credential's value
 * hidden: a cookie the API set, renewed or handed out with the error, is
 * the user's session. `error.headers` itself holds them all.
 */
export class HTTPError<TData = unknown> extends CourierError<"HTTP_ERROR"> {
  readonly status: number;
  readonly headers: Headers;
  readonly data: TData;

  /**
   * @param response - The answer, or status 0 with a description when there was none
   * @param options - `cause`: the error the request failed with, for a network failure;
   *   `message`: what went wrong, when the status alone does not say — a timeout
   *
   * @example
   * ```ts
   * new HTTPError({ status: 404, headers, data }); // message "HTTP 404"
   * ```
   */
  constructor(response: HttpResponse<TData>, options?: { cause?: unknown; message?: string }) {
    const fallback = response.status > 0 ? `HTTP ${response.status}` : "Network request failed";
    super(options?.message ?? fallback, {
      code: "HTTP_ERROR",
      context: { status: response.status },
      cause: options?.cause,
    });
    this.name = "HTTPError";
    this.status = response.status;
    this.headers = response.headers;
    this.data = response.data;
  }
}

defineNodePrinting(HTTPError.prototype);

export function isHTTPError<TData = unknown>(error: unknown): error is HTTPError<TData> {
  return error instanceof HTTPError;
}
