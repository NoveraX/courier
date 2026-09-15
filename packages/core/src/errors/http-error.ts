import type { HttpResponse } from "../http-client/types";
import { NexusError } from "./nexus-error";

/**
 * Thrown when an HTTP response has a non-2xx status, or when the underlying
 * fetch fails entirely (network error, status === 0). Carries the full
 * response so callers can inspect headers and body without re-fetching.
 */
export class HTTPError<TData = unknown> extends NexusError<"HTTP_ERROR"> {
  readonly status: number;
  readonly headers: Headers;
  readonly data: TData;

  constructor(response: HttpResponse<TData>) {
    super(response.status > 0 ? `HTTP ${response.status}` : "Network request failed", {
      code: "HTTP_ERROR",
      context: { status: response.status },
    });
    this.status = response.status;
    this.headers = response.headers;
    this.data = response.data;
  }
}

export function isHTTPError<TData = unknown>(error: unknown): error is HTTPError<TData> {
  return error instanceof HTTPError;
}
