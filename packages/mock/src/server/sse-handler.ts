import { logger } from "@noverax/courier";
import { describeFailure, SSE_CONTROL_EVENTS, type SSEEvent } from "@noverax/courier/realtime";
import type { Context as HonoContext } from "hono";

import type { MockRequestContext, ResolvedHandler } from "../types";

const ENCODER = new TextEncoder();
const NEWLINES = /[\r\n]/g;

/**
 * Handle an SSE mock endpoint — streams events via text/event-stream.
 * Called from handleMockRequest when handler.transport === "sse".
 *
 * The stream ends as a Courier server's does, with an event saying how:
 * finished, or failed with what the client may read. A mock stream used to
 * end with neither, so the client reconnected and replayed it forever; and a
 * generator that threw rejected with nobody listening, which could take the
 * mock server down.
 */
export function handleSSEMock(
  c: HonoContext,
  handler: ResolvedHandler,
  ctx: MockRequestContext,
): Response {
  const streamFn = handler.streamFn;
  if (!streamFn) {
    return c.json({ error: "SSE handler missing streamFn" }, 500);
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  void pumpEvents(streamFn, ctx, writer, c.req.raw.signal);

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
): Promise<void> {
  let end = `event: ${SSE_CONTROL_EVENTS.complete}\ndata: null\n\n`;
  const gen = streamFn(ctx);
  try {
    for await (const event of gen) {
      if (signal.aborted) break;
      if (!(await write(writer, formatEvent(event)))) break;
    }
  } catch (error) {
    logger.warn("MockSSE", "Stream handler failed", error);
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
