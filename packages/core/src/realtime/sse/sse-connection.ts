import { createLogger } from "../../logger";
import { backoffDelay, resolveBackoff } from "../backoff";
import { ConnectionError, fromErrorCode, type RealtimeError } from "../errors";
import type { ConnectionRetry } from "../retry-of";
import type { SubscriptionSink } from "../subscription-driver";
import type { BackoffConfig } from "../types";
import { type ConnectionEnd, type ConnectionProgress, readConnection } from "./sse-read";
import { SSEResponseError } from "./sse-response";
import type { SubscribeSSEOptions } from "./sse-types";

const log = createLogger("SSE");

/** Refusals that may succeed on a later attempt */
const RETRYABLE = new Set([408, 429]);

/** Resolved configuration passed to the connection loop */
export interface SSEConnectionConfig {
  headers?: Record<string, string> | undefined;
  backoff?: BackoffConfig | undefined;
  heartbeatTimeout: number;
  maxAttempts: number;
  parse: (raw: string) => unknown;
  /** Optional callback fired once per successful fetch (used by studio instrumentation) */
  onResponse?: ((response: Response) => void) | undefined;
  /** What each connection is opened with besides `headers`, asked for before it opens */
  beforeConnect?: SubscribeSSEOptions["beforeConnect"];
  /** What sends each connection's request, in place of the platform's `fetch` */
  fetch?: SubscribeSSEOptions["fetch"];
}

/** Mutable context shared between connection loop and stream consumer */
export interface SSEConnectionCtx<TData> {
  readonly url: string;
  /** Aborted when the subscription is let go of */
  readonly controller: AbortController;
  readonly sink: SubscriptionSink<TData>;
  readonly config: SSEConnectionConfig;
  lastEventId: string | undefined;
  serverRetryMs: number | undefined;
  /** Why the last connection ended, as the subscription reported `reconnecting` */
  retry?: ConnectionRetry | undefined;
  /** The connection being read, aborted to reconnect at once */
  current?: AbortController | undefined;
  /** Set to reconnect at once; ends the wait before the next connection, when one is waited out */
  now?: (() => void) | boolean | undefined;
}

/**
 * Reconnect a subscription's stream at once: a wait before the next
 * connection ends now, and the connection being read is let go of for a new
 * one. A call while one is opening is that one.
 *
 * @param ctx - The subscription's connection loop
 */
export function reconnectNow<TData>(ctx: SSEConnectionCtx<TData>): void {
  const wake = ctx.now;
  ctx.now = true;
  if (typeof wake === "function") wake();
  else ctx.current?.abort();
}

/**
 * Run a subscription's connections until it ends: the server finished or
 * failed the stream, refused it for good, or `maxAttempts` attempts in a row
 * delivered nothing — or the caller closed it.
 *
 * A stream the server ended is told apart from a dropped connection, so a
 * finished stream is not reconnected and replayed from the start, and a
 * failure or refusal does not end the loop as though the stream had
 * finished. A connection that delivers anything resets the count and the
 * backoff.
 */
export async function runConnectionLoop<TData>(ctx: SSEConnectionCtx<TData>): Promise<void> {
  let failures = 0;
  let lastError: unknown;

  while (!ctx.controller.signal.aborted) {
    const progress: ConnectionProgress = { received: false, silent: false };
    ctx.sink.connecting();
    ctx.now = undefined;
    let end: ConnectionEnd = "dropped";
    let failed: unknown;
    try {
      end = await readConnection(ctx, progress);
    } catch (error) {
      if (ctx.controller.signal.aborted) return;
      const refused = refusalFailure(error);
      if (refused) return ctx.sink.end(refused);
      if (ctx.now !== true) {
        lastError = failed = error;
        if (error instanceof SSEResponseError) ctx.serverRetryMs ??= error.retryAfterMs;
        log.warn("SSE connection lost, will retry", error);
      }
    }
    if (end !== "dropped") return ctx.sink.end(end === "complete" ? undefined : end);
    if (ctx.controller.signal.aborted) return;

    failures = progress.received || ctx.now === true ? 0 : failures + 1;
    if (failures >= ctx.config.maxAttempts) return ctx.sink.end(gaveUp(failures, lastError));

    const delay = ctx.now === true ? 0 : noteRetry(ctx, failures, progress, failed);
    ctx.sink.reconnecting();
    await wait(delay, ctx);
    /* Asked to reconnect at once: the attempts start over. */
    if (ctx.now === true) failures = 0;
  }
}

/* Noted before the subscription reports `reconnecting`, so whoever hears it can ask why. */
function noteRetry<TData>(
  ctx: SSEConnectionCtx<TData>,
  failures: number,
  progress: ConnectionProgress,
  failed: unknown,
): number {
  const step = Math.max(0, failures - 1);
  const delay = ctx.serverRetryMs ?? backoffDelay(step, resolveBackoff(ctx.config.backoff));
  ctx.serverRetryMs = undefined;
  ctx.retry = {
    failures,
    retryIn: delay,
    ...(failed !== undefined && { error: failed }),
    ...(progress.silent && { silentFor: ctx.config.heartbeatTimeout }),
  };
  return delay;
}

/**
 * A refusal no retry would change — the request itself is wrong or not
 * allowed, or a redirect the client does not follow, as to another origin —
 * as the error the app reads. 408 and 429 are worth retrying.
 */
function refusalFailure(error: unknown): RealtimeError | undefined {
  if (!(error instanceof SSEResponseError)) return undefined;
  const { statusCode, reason, issues } = error;
  if (statusCode < 300 || statusCode >= 500 || RETRYABLE.has(statusCode)) return undefined;
  log.error("SSE request refused, not reconnecting", error);
  return fromErrorCode(4000 + statusCode, reason, issues);
}

function gaveUp(failures: number, lastError: unknown): ConnectionError {
  const status = lastError instanceof SSEResponseError ? lastError.statusCode : undefined;
  const cause = lastError instanceof Error ? `: ${lastError.message}` : "";
  return new ConnectionError(`SSE connection failed ${failures} times in a row${cause}`, status);
}

/* The wait before the next connection, ended early by the subscription's end or by `reconnectNow`. */
function wait<TData>(ms: number, ctx: SSEConnectionCtx<TData>): Promise<void> {
  if (ms === 0) return Promise.resolve();
  const { signal } = ctx.controller;
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", wake);
      if (ctx.now === wake) ctx.now = undefined;
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, { once: true });
    ctx.now = wake;
  });
}
