/**
 * Response building and history recording helpers for the mock route handler.
 *
 * `buildResponse` constructs the JSON response — the handler's data as the
 * body, a `Retry-After` header for 429/503, and any custom handler headers.
 * `pushHistory` appends a normalized history entry that tests and the admin
 * API can read back.
 */

import { HTTPError } from "@noverax/courier";
import type { Context as HonoContext } from "hono";
import { isRecord } from "../is-record";
import type { ResolvedHandler } from "../types";
import { isMockHttpError } from "./errors";
import type { RouteConfig } from "./route-types";

/**
 * Build the JSON response: the handler's data is the body, for an error as
 * for a success, so a `rejects(status, data)` answers with `data` as
 * declared and a client's `HTTPError.data` is the same whether the mock
 * server or the in-process mock client answered. A successful `raw` call — a
 * proxy client's `.raw` — is answered with `{ status, headers, data }`, as a
 * Courier proxy answers it.
 */
export function buildResponse(
  c: HonoContext,
  handler: Pick<ResolvedHandler, "isError" | "status" | "headers">,
  status: number,
  data: unknown,
  raw = false,
): Response {
  const envelope = raw && !handler.isError;
  const body = envelope ? { status, headers: handler.headers ?? {}, data } : data;
  const res = c.json(body, status as 200);

  if (handler.isError && (status === 429 || status === 503)) {
    const retryAfter = isRecord(data) ? data.retryAfter : undefined;
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

/** How a handler that threw is answered */
export interface HandlerFailure {
  status: number;
  body: unknown;
  message: string;
}

/**
 * The answer for a handler that threw. An `HTTPError` — the error a real
 * call fails with, and what a replayed recording rejects with — answers
 * with its own status and body; a `MockHttpError` with its status and
 * `{ error }`; anything else with 500.
 *
 * @param err What the handler threw
 * @returns The status, body and message to answer and log
 * @example
 * ```ts
 * handlerFailure(new MockHttpError(404, "users with id 9 not found"));
 * // { status: 404, body: { error: "users with id 9 not found" }, message: "users with id 9 not found" }
 * ```
 */
export function handlerFailure(err: unknown): HandlerFailure {
  if (err instanceof HTTPError && err.status >= 400 && err.status <= 599) {
    return { status: err.status, body: err.data, message: err.message };
  }
  if (isMockHttpError(err)) {
    return { status: err.status, body: { error: err.message }, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: message }, message };
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
  /** Whether the mock answered it, rather than the source's own server (default: true) */
  mocked?: boolean;
}

/** Append a normalized history entry to the route config history array */
export function pushHistory(config: RouteConfig, entry: HistoryEntryInput): void {
  config.history.push({
    group: entry.group,
    method: entry.method,
    variables: entry.variables,
    mocked: entry.mocked ?? true,
    duration: performance.now() - entry.start,
    timestamp: Date.now(),
    result: entry.error ? undefined : { status: entry.status, data: entry.data },
    error: entry.error ? new Error(entry.error) : undefined,
    stream: entry.stream,
  });
}
