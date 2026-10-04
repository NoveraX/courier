/**
 * Per-transport dispatch helpers for the playground responder. Each helper
 * runs the canonical local executor and forwards results back to Studio via
 * `playground:chunk` / `playground:end`. Errors propagate up to the caller
 * which translates them into `playground:error`.
 */

import type { Sources } from "@noverax/courier/define";

import { playgroundRequestId } from "../lib/playground-request-id";
import type { PlaygroundExecutePayload } from "./playground-payloads";
import type { ResponderSocket } from "./playground-responder";

/** A stream or channel call, as the Playground runs it. */
export interface StreamCall {
  source: string;
  group: string;
  method: string;
  /** As the Playground sent them; the endpoint's schema checks them */
  variables: unknown;
  headers: Record<string, string>;
}

/** Opens a stream: in this process, or through the app's proxy route. */
/** What a run opens a stream with: when to stop, and the row Studio shows it under. */
export interface OpenOptions {
  signal: AbortSignal;
  requestId: string;
}

export type StreamOpener = (
  sources: Sources,
  call: StreamCall,
  options: OpenOptions,
) => Promise<AsyncIterable<unknown>>;

/** A channel the Playground reads from and writes to, wherever it is served. */
export interface PlaygroundChannel {
  readonly status: string;
  on(event: "data", handler: (data: unknown) => void): () => void;
  on(event: "status", handler: (status: string) => void): () => void;
  close(): void;
  send(data: unknown): unknown;
}

/** Opens a channel: in this process, or through the app's proxy route. */
export type ChannelOpener = (
  sources: Sources,
  call: StreamCall,
  options: OpenOptions,
) => Promise<PlaygroundChannel>;

/**
 * Run an SSE stream and send Studio each event, whole, then how it ended.
 *
 * @param socket - The runtime's socket to Studio
 * @param payload - The Playground's request
 * @param sources - The sources the stream is looked up in
 * @param signal - Ends the stream when the Playground cancels it
 * @param exec - Opens the stream, in this process or through the app's proxy route
 * @example
 * ```ts
 * await dispatchSSE(socket, payload, sources, ac.signal, executeDirectSSE);
 * ```
 */
export function dispatchSSE(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  signal: AbortSignal,
  exec: StreamOpener,
): Promise<void> {
  return dispatchStream(socket, payload, { sources, signal, exec }, (event) => ({
    kind: "sse-event",
    event,
  }));
}

/**
 * Run a WS push and send Studio the data of each event it sends, as a
 * channel's messages are sent, then how it ended. A push only sends, so it
 * is read as a stream and nothing is written to it.
 *
 * @param socket - The runtime's socket to Studio
 * @param payload - The Playground's request
 * @param sources - The sources the push is looked up in
 * @param signal - Ends the subscription when the Playground cancels it
 * @param exec - Subscribes, in this process or through the app's proxy route
 * @example
 * ```ts
 * await dispatchWSPush(socket, payload, sources, ac.signal, executeDirectWSPush);
 * ```
 */
export function dispatchWSPush(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  signal: AbortSignal,
  exec: StreamOpener,
): Promise<void> {
  return dispatchStream(socket, payload, { sources, signal, exec }, (event) => ({
    kind: "ws-message",
    data: typeof event === "object" && event !== null && "data" in event ? event.data : event,
  }));
}

async function dispatchStream(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  { sources, signal, exec }: { sources: Sources; signal: AbortSignal; exec: StreamOpener },
  chunkOf: (event: unknown) => Record<string, unknown>,
): Promise<void> {
  const startedAt = performance.now();
  const requestId = playgroundRequestId(payload.rid);
  const subscription = await exec(sources, callOf(payload), { signal, requestId });

  let count = 0;
  try {
    for await (const event of subscription) {
      count++;
      socket.emit("playground:chunk", { rid: payload.rid, chunk: chunkOf(event) });
    }
  } finally {
    socket.emit("playground:end", {
      rid: payload.rid,
      summary: { durationMs: performance.now() - startedAt, count },
    });
  }
}

function callOf(payload: PlaygroundExecutePayload): StreamCall {
  return {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables: payload.variables ?? {},
    headers: payload.headers ?? {},
  };
}

export async function dispatchWS(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  signal: AbortSignal,
  exec: ChannelOpener,
  onChannelOpen?: (channel: PlaygroundChannel) => void,
): Promise<void> {
  const startedAt = performance.now();
  const requestId = playgroundRequestId(payload.rid);
  const channel = await exec(sources, callOf(payload), { signal, requestId });
  onChannelOpen?.(channel);
  const unsubOpen = announceConnected(channel, () =>
    socket.emit("playground:chunk", { rid: payload.rid, chunk: { kind: "ws-open" } }),
  );

  const unsubData = channel.on("data", (data: unknown) => {
    socket.emit("playground:chunk", {
      rid: payload.rid,
      chunk: { kind: "ws-message", data },
    });
  });

  // Resolve on EITHER (a) external abort signal, OR (b) channel reaching the
  // `disconnected` status — server-initiated closes and natural completions
  // both transition through this state. Without (b) the function would hang
  // forever when the channel closes naturally and `playground:end` would
  // never reach Studio.
  await new Promise<void>((resolve) => {
    if (signal.aborted || channel.status === "disconnected") {
      resolve();
      return;
    }
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      unsubStatus();
      resolve();
    };
    const unsubStatus = channel.on("status", (status) => {
      if (status === "disconnected") settle();
    });
    signal.addEventListener("abort", settle, { once: true });
  });

  unsubData();
  unsubOpen();
  channel.close();
  socket.emit("playground:end", {
    rid: payload.rid,
    summary: { durationMs: performance.now() - startedAt },
  });
}

/* A channel that says nothing on join is open all the same: the Playground
   is told once it connects, so it does not wait on the first message. */
function announceConnected(channel: PlaygroundChannel, announce: () => void): () => void {
  let announced = false;
  const onStatus = (status: string): void => {
    if (status !== "connected" || announced) return;
    announced = true;
    announce();
  };
  onStatus(channel.status);
  return channel.on("status", onStatus);
}
