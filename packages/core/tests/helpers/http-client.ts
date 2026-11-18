import type { WSHandler } from "../../src/adapter/ws-types";
import { parseSSEFrames } from "../../src/realtime/sse/parse-sse";
import { HTTP_TRANSPORT_VERSION, type HTTPRequestHead } from "../../src/realtime/ws/http-protocol";
import { encodeMessage, type WSMessage } from "../../src/realtime/ws/ws-protocol";

/** An event of an answer: a frame, with its number, or a named event of the transport's. */
export interface AnswerEvent {
  readonly id?: string | undefined;
  readonly event?: string | undefined;
  readonly data: string;
}

/** The events of an answer, read as they come. */
export interface AnswerEvents {
  /** The next event, or `undefined` once the answer has ended */
  next(): Promise<AnswerEvent | undefined>;
  /** Every event left, once the answer has ended */
  rest(): Promise<AnswerEvent[]>;
  /** Stop reading, as a client that leaves */
  cancel(): Promise<void>;
}

/**
 * A request of the HTTP transport, as a client sends it to the socket's path.
 *
 * @example
 * ```ts
 * const response = await post(handler, { op: "poll", token, ack: 3 });
 * ```
 */
export function post(
  handler: WSHandler,
  head: HTTPRequestHead,
  frames: readonly WSMessage[] = [],
  url = "http://localhost/api/ws",
): Promise<Response> {
  const body = [JSON.stringify(head), ...frames.map((frame) => encodeMessage(frame))].join("\n");
  return handler.handleHTTP(new Request(url, { method: "POST", body }), "203.0.113.7");
}

/**
 * Open a connection over HTTP with its first frames.
 *
 * @example
 * ```ts
 * const { token, events } = await openOverHTTP(handler, "stream", [authFrame()]);
 * ```
 */
export async function openOverHTTP(
  handler: WSHandler,
  op: "stream" | "poll",
  frames: readonly WSMessage[],
): Promise<{ token: string; events: AnswerEvents; response: Response }> {
  const response = await post(handler, { op, v: HTTP_TRANSPORT_VERSION }, frames);
  const events = eventsOf(response);
  const open = await events.next();
  const token = open?.event === "open" ? (JSON.parse(open.data) as { token: string }).token : "";
  return { token, events, response };
}

/**
 * Read the events of an answer.
 *
 * @example
 * ```ts
 * const events = eventsOf(await post(handler, { op: "poll", token }));
 * await events.rest();
 * ```
 */
export function eventsOf(response: Response): AnswerEvents {
  if (response.body === null) throw new Error(`No body: ${response.status}`);
  /* Read through a pipe a client's leaving aborts: it cancels the answer's body, as a runtime does
     once its client is gone, even while a read waits. */
  const leaving = new AbortController();
  const pipe = new TransformStream<Uint8Array, Uint8Array>();
  response.body.pipeTo(pipe.writable, { signal: leaving.signal }).catch(() => undefined);
  const frames = parseSSEFrames(pipe.readable)[Symbol.asyncIterator]();
  async function next(): Promise<AnswerEvent | undefined> {
    for (;;) {
      const read = await frames.next().catch(() => ({ done: true as const, value: undefined }));
      if (read.done) return undefined;
      const { event } = read.value;
      if (event) return { id: event.id, event: event.event, data: event.data };
    }
  }
  return {
    next,
    async rest() {
      const all: AnswerEvent[] = [];
      for (let event = await next(); event !== undefined; event = await next()) all.push(event);
      return all;
    },
    async cancel() {
      leaving.abort();
      await Promise.resolve();
    },
  };
}

/** A frame's message, as the client reads it. */
export function messageOf(event: AnswerEvent | undefined): Record<string, unknown> {
  return JSON.parse(event?.data ?? "null") as Record<string, unknown>;
}
