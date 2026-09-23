import type { SSEEvent } from "@noverax/courier/realtime";

import type { MockChannelFn, MockStreamFn, ResolvedHandler } from "../types";

/** Make a handler answer as an SSE stream */
export function streamWith(handler: ResolvedHandler, fn: MockStreamFn): void {
  handler.transport = "sse";
  handler.streamFn = fn;
  handler.fn = () => undefined;
  handler.isError = false;
}

/** Make a handler answer as a WebSocket channel */
export function channelWith(handler: ResolvedHandler, fn: MockChannelFn): void {
  handler.transport = "ws";
  handler.channelFn = fn;
  handler.fn = () => undefined;
  handler.isError = false;
}

/** A stream that sends these events, in order, then ends */
export function streamOf(events: SSEEvent[]): MockStreamFn {
  return async function* () {
    for (const event of events) yield event;
  };
}
