import { createLogger } from "../../logger";
import { calculateBackoff } from "../backoff";
import type { ConnectionState } from "../connection-state";
import type { BackoffConfig } from "../types";
import type { EventQueue } from "./event-queue";
import { parseSSEStream } from "./parse-sse";

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

/** Run the reconnecting SSE connection loop until abort or maxAttempts */
export async function runConnectionLoop<TData>(ctx: SSEConnectionCtx<TData>): Promise<void> {
  let attempt = 0;

  while (!ctx.controller.signal.aborted && attempt < ctx.config.maxAttempts) {
    try {
      ctx.state.set("connecting");
      await consumeStream(ctx);
    } catch (err) {
      if (ctx.controller.signal.aborted) break;
      if (isFatalError(err)) {
        log.error("Fatal SSE error, not reconnecting", err);
        break;
      }
      log.warn(`SSE connection lost (attempt ${attempt + 1}), will retry`, err);
    }

    attempt++;
    if (ctx.controller.signal.aborted || attempt >= ctx.config.maxAttempts) break;

    ctx.state.set("reconnecting");
    const delay = ctx.serverRetryMs ?? calculateBackoff(attempt - 1, ctx.config.backoff);
    ctx.serverRetryMs = undefined;
    await sleep(delay, ctx.controller.signal);
  }

  ctx.state.set("disconnected");
  ctx.queue.finish();
}

async function consumeStream<TData>(ctx: SSEConnectionCtx<TData>): Promise<void> {
  const reqHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    ...ctx.config.headers,
  };
  if (ctx.lastEventId) reqHeaders["Last-Event-ID"] = ctx.lastEventId;

  const response = await fetch(ctx.url, {
    headers: reqHeaders,
    signal: ctx.controller.signal,
  });

  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new SSEError(response.status, response.statusText);
  }

  ctx.config.onResponse?.(response);
  ctx.state.set("connected");
  let heartbeatTimer = setTimeout(() => ctx.controller.abort(), ctx.config.heartbeatTimeout);

  try {
    for await (const raw of parseSSEStream(response.body)) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => ctx.controller.abort(), ctx.config.heartbeatTimeout);

      if (raw === null) continue; // Comment/heartbeat — timer already reset
      if (raw.id !== undefined) ctx.lastEventId = raw.id;
      if (raw.retry !== undefined) ctx.serverRetryMs = raw.retry;

      try {
        const parsed = ctx.config.parse(raw.data) as TData;
        ctx.queue.push({ ...raw, data: parsed });
      } catch (parseErr) {
        log.warn(`Failed to parse SSE event data: ${raw.data}`, parseErr);
      }
    }
  } finally {
    clearTimeout(heartbeatTimer);
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
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
