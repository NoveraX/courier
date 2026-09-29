import { logger } from "@noverax/courier";
import { describeFailure, SSE_CONTROL_EVENTS } from "@noverax/courier/internal";
import type { SSEEvent } from "@noverax/courier/realtime";
import type { Context as HonoContext } from "hono";

import type { MockRequestContext, ResolvedHandler } from "../types";

const ENCODER = new TextEncoder();
const NEWLINES = /[\r\n]/g;

/** How a mock stream ended: how many events it sent, and why it failed if it did */
export interface StreamOutcome {
  events: number;
  error?: string;
}

/**
 * Handle an SSE mock endpoint — streams events via text/event-stream.
 * Called from handleMockRequest when handler.transport === "sse".
 *
 * The stream ends as a Courier server's does, with an event saying how:
 * finished, or failed with what the client may read. A mock stream used to
 * end with neither, so the client reconnected and replayed it forever; and a
 * generator that threw rejected with nobody listening, which could take the
 * mock server down.
 *
 * @param c        The request's Hono context
 * @param handler  The stream's handler
 * @param ctx      The request as the stream function sees it
 * @param stopping Fires when the server stops: the answer ends then
 * @param onEnded  Called once the stream has ended, however it ended, so the
 *   request can be logged as finished
 * @returns The streaming response
 * @example
 * ```ts
 * return handleSSEMock(c, handler, ctx, streams.signal(), ({ events }) => log(`${events} events sent`));
 * ```
 */
export function handleSSEMock(
  c: HonoContext,
  handler: ResolvedHandler,
  ctx: MockRequestContext,
  stopping: AbortSignal | undefined,
  onEnded: (outcome: StreamOutcome) => void,
): Response {
  const streamFn = handler.streamFn;
  if (!streamFn) {
    onEnded({ events: 0, error: "SSE handler missing streamFn" });
    return c.json({ error: "SSE handler missing streamFn" }, 500);
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const signal = stopping ? AbortSignal.any([c.req.raw.signal, stopping]) : c.req.raw.signal;
  /* The server stopping ends the answer now, not at the generator's next
     event — and without the frame that says the stream completed, so its
     client reconnects. */
  stopping?.addEventListener("abort", () => void writer.close().catch(() => undefined), {
    once: true,
  });
  void pumpEvents(streamFn, ctx, writer, signal).then(onEnded);

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...handler.headers,
    },
  });
}

/** Write SSE events from generator to writable stream, then how it ended */
async function pumpEvents(
  streamFn: NonNullable<ResolvedHandler["streamFn"]>,
  ctx: MockRequestContext,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  let end = `event: ${SSE_CONTROL_EVENTS.complete}\ndata: null\n\n`;
  const outcome: StreamOutcome = { events: 0 };
  const gen = streamFn(ctx);
  try {
    for await (const event of gen) {
      if (signal.aborted) break;
      if (!(await write(writer, formatEvent(event)))) break;
      outcome.events++;
    }
  } catch (error) {
    logger.warn("MockSSE", "Stream handler failed", error);
    // The client reads the safe description; the mock's own log names the cause
    outcome.error = error instanceof Error ? error.message : String(error);
    end = `event: ${SSE_CONTROL_EVENTS.error}\ndata: ${JSON.stringify(describeFailure(error, "Stream failed"))}\n\n`;
  }
  if (signal.aborted) {
    await gen.return(undefined);
  } else {
    await write(writer, end);
  }
  await writer.close().catch((error: unknown) => {
    logger.debug("MockSSE", "Stream already closed", error);
  });
  return outcome;
}

/** Write one frame; false once the client has gone and nothing can be written */
async function write(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  frame: string,
): Promise<boolean> {
  try {
    await writer.write(ENCODER.encode(frame));
    return true;
  } catch (error) {
    logger.debug("MockSSE", "Client gone", error);
    return false;
  }
}

/** Format an event as a Courier server does: JSON data, fields kept on one line */
function formatEvent(event: SSEEvent<unknown>): string {
  let frame = "";
  if (event.id !== undefined) frame += `id: ${String(event.id).replace(NEWLINES, "")}\n`;
  if (event.event) frame += `event: ${event.event.replace(NEWLINES, "")}\n`;
  if (event.retry !== undefined) frame += `retry: ${event.retry}\n`;
  return `${frame}data: ${JSON.stringify(event.data ?? null)}\n\n`;
}
