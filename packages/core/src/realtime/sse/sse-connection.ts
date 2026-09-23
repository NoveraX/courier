import { createLogger } from "../../logger";
import { calculateBackoff } from "../backoff";
import type { ConnectionState } from "../connection-state";
import type { BackoffConfig } from "../types";
import type { EventQueue } from "./event-queue";
import { parseSSEStream, type RawSSEEvent } from "./parse-sse";

const log = createLogger("SSE");

/** Fatal HTTP status codes that should NOT trigger reconnection */
const FATAL_CODES = new Set([401, 403, 404, 405]);

/** Resolved configuration passed to the connection loop */
export interface SSEConnectionConfig {
  headers?: Record<string, string>;
  backoff?: BackoffConfig;
  heartbeatTimeout: number;
  maxAttempts: number;
  parse: (raw: string) => unknown;
  /** Optional callback fired once per successful fetch (used by studio instrumentation) */
  onResponse?: (response: Response) => void;
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
 * Run the reconnecting SSE connection loop until abort or `maxAttempts`
 * attempts in a row fail to deliver anything.
 *
 * A connection that delivered anything resets the count and the backoff:
 * counting every attempt over the subscription's life ended a long-lived
 * stream after its Nth drop in a day, and left the first retry after hours
 * of health at the longest delay.
 */
export async function runConnectionLoop<TData>(ctx: SSEConnectionCtx<TData>): Promise<void> {
  let failures = 0;

  while (!ctx.controller.signal.aborted && failures < ctx.config.maxAttempts) {
    const progress = { received: false };
    try {
      ctx.state.set("connecting");
      await consumeStream(ctx, progress);
    } catch (err) {
      if (ctx.controller.signal.aborted) break;
      if (isFatalError(err)) {
        log.error("Fatal SSE error, not reconnecting", err);
        break;
      }
      log.warn("SSE connection lost, will retry", err);
    }

    failures = progress.received ? 0 : failures + 1;
    if (ctx.controller.signal.aborted || failures >= ctx.config.maxAttempts) break;

    ctx.state.set("reconnecting");
    const step = Math.max(0, failures - 1);
    const delay = ctx.serverRetryMs ?? calculateBackoff(step, ctx.config.backoff);
    ctx.serverRetryMs = undefined;
    await sleep(delay, ctx.controller.signal);
  }

  ctx.state.set("disconnected");
  ctx.queue.finish();
}

/**
 * Read one connection until it ends.
 *
 * The connection has its own abort: a server that falls silent for longer
 * than `heartbeatTimeout` is dropped and reconnected. The silence used to
 * abort the whole subscription, which then ended as though the server had
 * finished it.
 */
async function consumeStream<TData>(
  ctx: SSEConnectionCtx<TData>,
  progress: { received: boolean },
): Promise<void> {
  const connection = new AbortController();
  const stop = () => connection.abort();
  ctx.controller.signal.addEventListener("abort", stop, { once: true });
  let silence: ReturnType<typeof setTimeout> | undefined;
  const expectMore = () => {
    clearTimeout(silence);
    silence = setTimeout(stop, ctx.config.heartbeatTimeout);
  };

  try {
    const response = await fetch(ctx.url, {
      headers: requestHeaders(ctx),
      signal: connection.signal,
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new SSEError(response.status, response.statusText);
    }

    ctx.config.onResponse?.(response);
    ctx.state.set("connected");
    expectMore();

    for await (const raw of parseSSEStream(response.body)) {
      expectMore();
      progress.received = true;
      if (raw === null) continue; // Comment/heartbeat — timer already reset
      deliver(ctx, raw);
    }
  } finally {
    clearTimeout(silence);
    ctx.controller.signal.removeEventListener("abort", stop);
  }
}

function requestHeaders<TData>(ctx: SSEConnectionCtx<TData>): Record<string, string> {
  const headers: Record<string, string> = { Accept: "text/event-stream", ...ctx.config.headers };
  if (ctx.lastEventId) headers["Last-Event-ID"] = ctx.lastEventId;
  return headers;
}

function deliver<TData>(ctx: SSEConnectionCtx<TData>, raw: RawSSEEvent): void {
  if (raw.id !== undefined) ctx.lastEventId = raw.id;
  if (raw.retry !== undefined) ctx.serverRetryMs = raw.retry;
  try {
    const parsed = ctx.config.parse(raw.data) as TData;
    ctx.queue.push({ ...raw, data: parsed });
  } catch (parseErr) {
    log.warn(`Failed to parse SSE event data: ${raw.data}`, parseErr);
  }
}

class SSEError extends Error {
  constructor(
    readonly statusCode: number,
    statusText: string,
  ) {
    super(`SSE connection failed: ${statusCode} ${statusText}`);
    this.name = "SSEError";
  }
}

function isFatalError(err: unknown): boolean {
  return err instanceof SSEError && FATAL_CODES.has(err.statusCode);
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
