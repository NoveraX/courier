import { createLogger } from "../../logger";
import { isFieldRecord } from "../../utils/body-kind";
import type { StreamFailure } from "../describe-failure";
import { ConnectionError, fromErrorCode, type RealtimeError } from "../errors";
import { SSE_CONTROL_EVENTS } from "./control-events";
import { parseSSEFrames, type RawSSEEvent, type SSEFrame } from "./parse-sse";
import type { SSEConnectionCtx } from "./sse-connection";
import { eventStreamOf, refusal } from "./sse-response";

const log = createLogger("SSE");
const INTERNAL_ERROR = 5000;

/** How one connection ended: the server said so, or it just stopped. */
export type ConnectionEnd = "complete" | "dropped" | RealtimeError;

/**
 * Read one connection until it ends.
 *
 * The connection has its own abort: a server that falls silent for longer
 * than `heartbeatTimeout` is dropped and reconnected, while the subscription
 * goes on — it does not end as though the server had finished it.
 *
 * @returns How it ended — a failure, too, when the server answered with
 *   something other than an event stream
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
    if (!response.ok) throw await refusal(response);
    const body = eventStreamOf(response);
    if (body instanceof ConnectionError) {
      await response.body?.cancel();
      log.error("SSE response is not an event stream, not reconnecting", body);
      return body;
    }

    ctx.config.onResponse?.(response);
    ctx.state.set("connected");
    expectMore();

    for await (const frame of parseSSEFrames(body)) {
      expectMore();
      progress.received = true;
      const end = take(ctx, frame);
      if (end) return end;
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

/**
 * Take in one block of the stream: what it says about reconnecting, and the
 * event it dispatches. A block with no event — a heartbeat, or one that only
 * sets an id or a retry — delivers nothing.
 *
 * @returns The end the block announced, if it announced one
 */
function take<TData>(ctx: SSEConnectionCtx<TData>, frame: SSEFrame): ConnectionEnd | undefined {
  if (frame.id !== undefined) ctx.lastEventId = frame.id;
  if (frame.retry !== undefined) ctx.serverRetryMs = frame.retry;
  const { event } = frame;
  if (!event) return undefined;
  if (event.event?.startsWith(SSE_CONTROL_EVENTS.prefix)) return controlEnd(event);
  deliver(ctx, event);
  return undefined;
}

/**
 * The end a Courier server announced, if this control event is one. Any other
 * — the notice of a server going away, or one this client does not know — is
 * about the stream, not for the app, and ends nothing.
 */
function controlEnd(raw: RawSSEEvent): ConnectionEnd | undefined {
  if (raw.event === SSE_CONTROL_EVENTS.complete) return "complete";
  if (raw.event !== SSE_CONTROL_EVENTS.error) return undefined;
  const failure = parseFailure(raw.data);
  return fromErrorCode(failure.code, failure.message, failure.issues);
}

function parseFailure(data: string): StreamFailure {
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      isFieldRecord(parsed) &&
      typeof parsed.code === "number" &&
      typeof parsed.message === "string"
    ) {
      const issues = Array.isArray(parsed.issues) ? parsed.issues : undefined;
      return { code: parsed.code, message: parsed.message, ...(issues && { issues }) };
    }
  } catch (error) {
    log.warn("Unreadable stream failure from the server", error);
  }
  return { code: INTERNAL_ERROR, message: "Stream failed" };
}

function deliver<TData>(ctx: SSEConnectionCtx<TData>, raw: RawSSEEvent): void {
  try {
    const parsed = ctx.config.parse(raw.data) as TData;
    ctx.queue.push({ ...raw, data: parsed });
  } catch (parseErr) {
    log.warn(`Skipped an SSE event whose data could not be parsed: ${excerpt(raw.data)}`, parseErr);
  }
}

const EXCERPT_LENGTH = 120;

/* Event data is the server's, of any size and possibly sensitive; the log
   gets enough of it to recognise, and its length. */
function excerpt(data: string): string {
  if (data.length <= EXCERPT_LENGTH) return JSON.stringify(data);
  return `${JSON.stringify(data.slice(0, EXCERPT_LENGTH))}… (${data.length} characters)`;
}
