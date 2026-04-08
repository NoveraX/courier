import type { Context as HonoContext } from "hono";
import type { MockRequestContext, ResolvedHandler } from "../types";

/**
 * Handle an SSE mock endpoint — streams events via text/event-stream.
 * Called from handleMockRequest when handler.transport === "sse".
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

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  void pumpEvents(streamFn, ctx, writer, encoder, c.req.raw.signal);

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

/** Write SSE events from generator to writable stream */
async function pumpEvents(
  streamFn: NonNullable<ResolvedHandler["streamFn"]>,
  ctx: MockRequestContext,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  signal?: AbortSignal,
): Promise<void> {
  const gen = streamFn(ctx);

  try {
    for await (const event of gen) {
      if (signal?.aborted) break;

      let frame = "";
      if (event.id) frame += `id: ${event.id}\n`;
      if (event.event) frame += `event: ${event.event}\n`;
      if (event.retry) frame += `retry: ${event.retry}\n`;
      frame += `data: ${JSON.stringify(event.data)}\n\n`;

      await writer.write(encoder.encode(frame));
    }
  } finally {
    if (signal?.aborted) await gen.return(undefined);
    await writer.close().catch(() => {});
  }
}
