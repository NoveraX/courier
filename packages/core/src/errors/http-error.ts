import type { HttpResponse } from "../http-client/types";
import { CourierError } from "./courier-error";
import { defineNodePrinting } from "./http-error-inspect";

/* An answer's status, as RFC 9110 numbers them. */
const FIRST_STATUS = 100;
const LAST_STATUS = 599;

/**
 * Thrown when a request got an answer whose status is not a success: a 4xx
 * or a 5xx from the upstream, a 3xx it was not to follow. Carries the full
 * answer, so callers can read its headers and body without asking again. A
 * request that got no answer is a `NetworkError`, and one whose time ran out
 * a `TimeoutError`: an `HTTPError` always has an answer's status.
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
   * @param response - The answer: its status, 100 to 599, its headers and its body
   * @param options - `cause`: the error behind it, such as a body that would not parse;
   *   `message`: what went wrong, when the status alone does not say
   * @throws {RangeError} For a status no answer has, such as the 0 of a request that got none
   *
   * @example
   * ```ts
   * new HTTPError({ status: 404, headers, data }); // message "HTTP 404"
   * ```
   */
  constructor(response: HttpResponse<TData>, options?: { cause?: unknown; message?: string }) {
    const { status } = response;
    /* NaN fails both comparisons, as a status outside the range fails one. */
    if (!(status >= FIRST_STATUS && status <= LAST_STATUS)) {
      throw new RangeError(`HTTPError status ${status} is no answer's: 100 to 599`);
    }
    super(options?.message ?? `HTTP ${status}`, {
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
