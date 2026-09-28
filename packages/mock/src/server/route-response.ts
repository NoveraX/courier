/**
 * Response building and history recording helpers for the mock route handler.
 *
 * `buildResponse` constructs the JSON response with the proper error
 * envelope, `Retry-After` header for 429/503, and any custom handler
 * headers. `pushHistory` appends a normalized history entry that the
 * studio bridge, tests, and admin API can read back.
 */

import type { Context as HonoContext } from "hono";
import type { RouteConfig } from "./route-types";

/**
 * Build the JSON response: the data, or the error shape, with Retry-After and
 * the handler's custom headers. A successful `raw` call — a proxy client's
 * `.raw` — is answered with `{ status, headers, data }`, as a Courier proxy
 * answers it.
 */
export function buildResponse(
  c: HonoContext,
  handler: { isError: boolean; status: number; headers?: Record<string, string> },
  status: number,
  data: unknown,
  raw = false,
): Response {
  const envelope = raw && !handler.isError;
  const body = handler.isError
    ? { error: data }
    : envelope
      ? { status, headers: handler.headers ?? {}, data }
      : data;
  const res = c.json(body, status as 200);

  if (handler.isError && (status === 429 || status === 503)) {
    const retryAfter = (data as Record<string, unknown>)?.retryAfter;
    if (typeof retryAfter === "number") {
      res.headers.set("Retry-After", String(retryAfter));
    }
  }

  if (handler.headers) {
    for (const [k, v] of Object.entries(handler.headers)) {
      res.headers.set(k, v);
    }
  }

  return res;
}

/** History entry shape for `pushHistory` — flattened request/response details */
export interface HistoryEntryInput {
  group: string;
  method: string;
  variables: unknown;
  start: number;
  status: number;
  data?: unknown;
  error?: string;
  stream?: boolean;
}

/** Append a normalized history entry to the route config history array */
export function pushHistory(config: RouteConfig, entry: HistoryEntryInput): void {
  config.history.push({
    group: entry.group,
    method: entry.method,
    variables: entry.variables,
    mocked: true,
    duration: performance.now() - entry.start,
    timestamp: Date.now(),
    result: entry.error ? undefined : { status: entry.status, data: entry.data },
    error: entry.error ? new Error(entry.error) : undefined,
    stream: entry.stream,
  });
}
