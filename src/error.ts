import type { MethodKyResponse } from "./instance/types";

export class HTTPError<R = unknown> extends Error {
  status: number;
  headers: Headers;
  data: R;

  constructor(response: MethodKyResponse<R>) {
    super(`HTTP ${response.status}`);
    this.name = "HTTPError";

    this.status = response.status;
    this.headers = response.headers;
    this.data = response.data;
  }
}

export function isHTTPError<R = unknown>(error: unknown): error is HTTPError<R> {
  return error instanceof HTTPError;
}
