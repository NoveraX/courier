import { createLogger } from "../../logger";
import { calculateBackoff } from "../backoff";
import type { ConnectionState } from "../connection-state";
import { ConnectionError, fromErrorCode, type RealtimeError } from "../errors";
import type { BackoffConfig } from "../types";
import type { EventQueue } from "./event-queue";
import { type ConnectionEnd, readConnection } from "./sse-read";
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
  readonly controller: AbortController;
  readonly state: ConnectionState;
  readonly queue: EventQueue<TData>;
  readonly config: SSEConnectionConfig;
  lastEventId: string | undefined;
  serverRetryMs: number | undefined;
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
    const progress = { received: false };
    ctx.state.set("connecting");
    let end: ConnectionEnd = "dropped";
    try {
      end = await readConnection(ctx, progress);
    } catch (error) {
      if (ctx.controller.signal.aborted) break;
      const refused = refusalFailure(error);
      if (refused) return finish(ctx, refused);
      lastError = error;
      if (error instanceof SSEResponseError) ctx.serverRetryMs ??= error.retryAfterMs;
      log.warn("SSE connection lost, will retry", error);
    }
    if (end !== "dropped") return finish(ctx, end === "complete" ? undefined : end);

    failures = progress.received ? 0 : failures + 1;
    if (failures >= ctx.config.maxAttempts) return finish(ctx, gaveUp(failures, lastError));
    if (ctx.controller.signal.aborted) break;

    ctx.state.set("reconnecting");
    const step = Math.max(0, failures - 1);
    const delay = ctx.serverRetryMs ?? calculateBackoff(step, ctx.config.backoff);
    ctx.serverRetryMs = undefined;
    await sleep(delay, ctx.controller.signal);
  }

  finish(ctx, undefined);
}

function finish<TData>(ctx: SSEConnectionCtx<TData>, failure: RealtimeError | undefined): void {
  ctx.state.set("disconnected");
  if (failure) ctx.queue.fail(failure);
  else ctx.queue.finish();
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, { once: true });
  });
}
