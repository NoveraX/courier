import type { SSEEvent } from "@noverax/courier/realtime";

import type { MockChannelFn, MockStreamFn, ResolvedHandler } from "../types";

/** Make a handler answer as an SSE stream */
export function streamWith(handler: ResolvedHandler, fn: MockStreamFn): void {
  handler.transport = "sse";
  handler.streamFn = fn;
  handler.fn = () => undefined;
  handler.isError = false;
  handler.nextStep = undefined;
}

/** Make a handler answer as a WebSocket channel */
export function channelWith(handler: ResolvedHandler, fn: MockChannelFn): void {
  handler.transport = "ws";
  handler.channelFn = fn;
  handler.fn = () => undefined;
  handler.isError = false;
  handler.nextStep = undefined;
}

/** A stream that sends these events, in order, then ends */
export function streamOf<TResponse, TVariables>(
  events: readonly SSEEvent<TResponse>[],
): MockStreamFn<TResponse, TVariables> {
  return async function* () {
    for (const event of events) yield event;
  };
}
