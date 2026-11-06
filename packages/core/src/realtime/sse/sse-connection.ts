import { createLogger } from "../../logger";
import { type Backoff, backoffDelay, hintedDelay } from "../backoff";
import { CLIENT_LIMITS } from "../client-limits";
import { ConnectionError, fromErrorCode, type RealtimeError } from "../errors";
import type { ConnectionRetry } from "../retry-of";
import type { SubscriptionSink } from "../subscription-driver";
import { type ConnectionEnd, type ConnectionProgress, readConnection } from "./sse-read";
import { SSEResponseError } from "./sse-response";
import type { SubscribeSSEOptions } from "./sse-types";
import { waitToReconnect } from "./sse-wait";

const log = createLogger("SSE");

/** Refusals that may succeed on a later attempt */
const RETRYABLE = new Set([408, 429]);

/** Resolved configuration passed to the connection loop */
export interface SSEConnectionConfig {
  headers?: Record<string, string> | undefined;
  backoff: Backoff;
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

/** Credentials the server refused with 401, and whether the one attempt with others was made. */
export interface SSERefusal {
  readonly fingerprint: string;
  readonly error: RealtimeError;
  retried: boolean;
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
  /**
   * Set to reconnect at once. While the wait before the next connection
   * lasts, what ends it — or, given a moment, brings its end forward to it
   */
  now?: ((at?: number) => void) | boolean | undefined;
  /** Before when the server asked not to be called back, by the clock that does not jump */
  notBefore?: number | undefined;
  /** When the open connection last heard from its server, by the clock a sleep moves on */
  heardAt?: number | undefined;
  /** The fingerprint of what the connection being opened was given by `beforeConnect` */
  opened?: string | undefined;
  /** The 401 the next connection answers to */
  refused?: SSERefusal | undefined;
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
 * finished. A connection that delivers anything starts `maxAttempts` over;
 * the backoff starts over only after one that stayed open
 * `RECONNECT_STABLE_MS`, so a server that ends each stream at once is
 * called back less and less often.
 */
export async function runConnectionLoop<TData>(ctx: SSEConnectionCtx<TData>): Promise<void> {
  let failures = 0;
  let unstable = 0;
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
      if (refused && retriesWithOthers(ctx, refused)) {
        log.warn("SSE request refused with 401: trying once more with credentials asked for anew");
        continue;
      }
      if (refused) {
        log.error("SSE request refused, not reconnecting", error);
        return ctx.sink.end(refused);
      }
      if (ctx.now !== true) {
        lastError = failed = error;
        if (error instanceof SSEResponseError) ctx.serverRetryMs ??= error.retryAfterMs;
        log.warn("SSE connection lost, will retry", error);
      }
    }
    if (end !== "dropped") return ctx.sink.end(end === "complete" ? undefined : end);
    if (ctx.controller.signal.aborted) return;

    const asked = ctx.now === true;
    failures = progress.received || asked ? 0 : failures + 1;
    if (failures >= ctx.config.maxAttempts) return ctx.sink.end(gaveUp(failures, lastError));
    unstable = stable(progress) || asked ? 0 : unstable + 1;

    const delay = asked ? 0 : noteRetry(ctx, Math.max(unstable - 1, 0), failures, progress, failed);
    ctx.sink.reconnecting();
    await waitToReconnect(delay, ctx);
    /* Asked to reconnect at once: the attempts start over. */
    if (ctx.now === true) failures = unstable = 0;
  }
}

function stable(progress: ConnectionProgress): boolean {
  const { openedAt } = progress;
  return (
    openedAt !== undefined && performance.now() - openedAt >= CLIENT_LIMITS.RECONNECT_STABLE_MS
  );
}

/*
 * A 401 is tried once more, at once, when there is a `beforeConnect` whose
 * credentials may have changed since — a token renewed meanwhile. Whether
 * they did is told as the next connection asks for them: the same again
 * would be refused again, so that one ends the stream with this refusal.
 */
function retriesWithOthers<TData>(ctx: SSEConnectionCtx<TData>, refused: RealtimeError): boolean {
  if (refused.code !== 4401 || !ctx.config.beforeConnect || ctx.refused?.retried) return false;
  ctx.refused = { fingerprint: ctx.opened ?? "", error: refused, retried: false };
  return true;
}

/* Noted before the subscription reports `reconnecting`, so whoever hears it can ask why. */
function noteRetry<TData>(
  ctx: SSEConnectionCtx<TData>,
  step: number,
  failures: number,
  progress: ConnectionProgress,
  failed: unknown,
): number {
  const asked = ctx.serverRetryMs;
  const hint =
    asked === undefined ? undefined : Math.min(asked, CLIENT_LIMITS.RECONNECT_MAX_HINT_MS);
  const { backoff } = ctx.config;
  const delay = hint === undefined ? backoffDelay(step, backoff) : hintedDelay(hint, step, backoff);
  ctx.serverRetryMs = undefined;
  ctx.notBefore = hint === undefined ? undefined : performance.now() + hint;
  ctx.retry = {
    failures,
    retryIn: delay,
    ...(failed !== undefined && { error: failed }),
    ...(progress.silent && { silentFor: ctx.config.heartbeatTimeout }),
  };
  return delay;
}

/** A refusal reconnecting cannot fix — a client error other than 408 or 429 — as the RealtimeError it ends with */
function refusalFailure(error: unknown): RealtimeError | undefined {
  if (!(error instanceof SSEResponseError)) return undefined;
  const { statusCode, reason, issues } = error;
  if (statusCode < 300 || statusCode >= 500 || RETRYABLE.has(statusCode)) return undefined;
  return fromErrorCode(4000 + statusCode, reason, issues);
}

function gaveUp(failures: number, lastError: unknown): ConnectionError {
  const status = lastError instanceof SSEResponseError ? lastError.statusCode : undefined;
  const cause = lastError instanceof Error ? `: ${lastError.message}` : "";
  return new ConnectionError(`SSE connection failed ${failures} times in a row${cause}`, status);
}
