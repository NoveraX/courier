import { createLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import { SSE_CONTROL_EVENTS } from "./control-events";
import { parseSSEStream, type RawSSEEvent } from "./parse-sse";
import type { SSEConnectionCtx } from "./sse-connection";

const log = createLogger("SSE");
const INTERNAL_ERROR = 5000;

/** How one connection ended: the server said so, or it just stopped. */
export type ConnectionEnd = "complete" | "dropped" | RealtimeError;

/** A response the server refused, with what it said about it. */
export class SSEResponseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly reason: string,
    readonly retryAfterMs: number | undefined,
  ) {
    super(`SSE connection failed: ${statusCode} ${reason}`);
    this.name = "SSEResponseError";
  }
}

/**
 * Read one connection until it ends.
 *
 * The connection has its own abort: a server that falls silent for longer
 * than `heartbeatTimeout` is dropped and reconnected. The silence used to
 * abort the whole subscription, which then ended as though the server had
 * finished it.
 *
 * @throws SSEResponseError when the server refuses the request
 */
export async function readConnection<TData>(
  ctx: SSEConnectionCtx<TData>,
  progress: { received: boolean },
): Promise<ConnectionEnd> {
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
    if (!response.ok || !response.body) throw await refusal(response);

    ctx.config.onResponse?.(response);
    ctx.state.set("connected");
    expectMore();

    for await (const raw of parseSSEStream(response.body)) {
      expectMore();
      progress.received = true;
      if (raw === null) continue; // Comment/heartbeat — timer already reset
      const end = controlEnd(raw);
      if (end) return end;
      deliver(ctx, raw);
    }
    return "dropped";
  } finally {
    clearTimeout(silence);
    ctx.controller.signal.removeEventListener("abort", stop);
    /* Releases the socket when the read stopped at an end-of-stream event. */
    connection.abort();
  }
}

function requestHeaders<TData>(ctx: SSEConnectionCtx<TData>): Record<string, string> {
  const headers: Record<string, string> = { Accept: "text/event-stream", ...ctx.config.headers };
  if (ctx.lastEventId) headers["Last-Event-ID"] = ctx.lastEventId;
  return headers;
}

/** The end a Courier server announced, if this event is one. */
function controlEnd(raw: RawSSEEvent): ConnectionEnd | undefined {
  if (raw.event === SSE_CONTROL_EVENTS.complete) return "complete";
  if (raw.event !== SSE_CONTROL_EVENTS.error) return undefined;
  const failure = parseFailure(raw.data);
  return fromErrorCode(failure.code, failure.message);
}

function parseFailure(data: string): { code: number; message: string } {
  try {
    const parsed = JSON.parse(data) as { code?: unknown; message?: unknown };
    if (typeof parsed.code === "number" && typeof parsed.message === "string") {
      return { code: parsed.code, message: parsed.message };
    }
  } catch (error) {
    log.warn("Unreadable stream failure from the server", error);
  }
  return { code: INTERNAL_ERROR, message: "Stream failed" };
}

function deliver<TData>(ctx: SSEConnectionCtx<TData>, raw: RawSSEEvent): void {
  if (raw.id !== undefined) ctx.lastEventId = raw.id;
  if (raw.retry !== undefined) ctx.serverRetryMs = raw.retry;
  try {
    const parsed = ctx.config.parse(raw.data) as TData;
    ctx.queue.push({ ...raw, data: parsed });
  } catch (parseErr) {
    log.warn(`Skipped an SSE event whose data could not be parsed: ${excerpt(raw.data)}`, parseErr);
  }
}

/** What the server said when it refused: its JSON `message`, or the status text. */
async function refusal(response: Response): Promise<SSEResponseError> {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const retryAfterMs =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
  const said = await messageOf(response);
  return new SSEResponseError(response.status, said ?? response.statusText, retryAfterMs);
}

async function messageOf(response: Response): Promise<string | undefined> {
  /* A proxy's HTML page or plain text carries no message; the status text serves. */
  if (!response.headers.get("Content-Type")?.includes("json")) {
    await response.body?.cancel();
    return undefined;
  }
  try {
    const body = (await response.json()) as { message?: unknown; error?: { message?: unknown } };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error?.message === "string") return body.error.message;
  } catch (error) {
    log.warn("Could not read the refused SSE response", error);
  }
  return undefined;
}

const EXCERPT_LENGTH = 120;

/* Event data is the server's, of any size and possibly sensitive; the log
   gets enough of it to recognise, and its length. */
function excerpt(data: string): string {
  if (data.length <= EXCERPT_LENGTH) return JSON.stringify(data);
  return `${JSON.stringify(data.slice(0, EXCERPT_LENGTH))}… (${data.length} characters)`;
}
