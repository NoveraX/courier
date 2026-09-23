import type { HttpResponse } from "../http-client/types";
import { CourierError } from "./courier-error";

/**
 * Thrown when an HTTP response has a non-2xx status, or when the underlying
 * fetch fails entirely (network error, status === 0). Carries the full
 * response so callers can inspect headers and body without re-fetching.
 */
export class HTTPError<TData = unknown> extends CourierError<"HTTP_ERROR"> {
  readonly status: number;
  readonly headers: Headers;
  readonly data: TData;

  /**
   * @param response - The answer, or status 0 with a description when there was none
   * @param options - `cause`: the error the request failed with, for a network failure
   */
  constructor(response: HttpResponse<TData>, options?: { cause?: unknown }) {
    super(response.status > 0 ? `HTTP ${response.status}` : "Network request failed", {
      code: "HTTP_ERROR",
      context: { status: response.status },
      cause: options?.cause,
    });
    this.status = response.status;
    this.headers = response.headers;
    this.data = response.data;
  }
}

export function isHTTPError<TData = unknown>(error: unknown): error is HTTPError<TData> {
  return error instanceof HTTPError;
}
