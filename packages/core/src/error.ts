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
