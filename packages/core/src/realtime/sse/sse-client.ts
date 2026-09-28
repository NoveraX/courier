import { createConnectionState } from "../connection-state";
import type { ConnectionStatus, SSESubscription } from "../types";
import { createEventQueue } from "./event-queue";
import { runConnectionLoop } from "./sse-connection";
import type { SubscribeSSEOptions } from "./sse-types";

/**
 * Subscribe to a Server-Sent Events stream via fetch.
 * Uses fetch (not EventSource) for custom header support (Authorization).
 * Automatically reconnects with exponential backoff and Last-Event-ID resume.
 *
 * @param url - SSE endpoint URL
 * @param options - Connection and parsing options
 * @returns SSESubscription — async iterable with lifecycle control
 *
 * @example
 * const sub = subscribeSSE<Notification>("/api/sse/notifications");
 * for await (const event of sub) {
 *   console.log(event.data); // typed as Notification
 * }
 */
export function subscribeSSE<TData = unknown>(
  url: string,
  options: SubscribeSSEOptions = {},
): SSESubscription<TData> {
  const state = createConnectionState();
  const controller = new AbortController();
  const queue = createEventQueue<TData>(options.maxBufferSize);

  linkSignal(options.signal, controller);

  void runConnectionLoop({
    url,
    controller,
    state,
    queue,
    config: {
      headers: options.headers,
      backoff: options.backoff,
      heartbeatTimeout: options.heartbeatTimeout ?? 45_000,
      maxAttempts: options.maxAttempts ?? Infinity,
      parse: options.parse ?? JSON.parse,
      ...(options.onResponse && { onResponse: options.onResponse }),
    },
    lastEventId: options.lastEventId,
    serverRetryMs: undefined,
  });

  const iter = queue.iterator(() => controller.abort());

  return {
    [Symbol.asyncIterator]() {
      return iter;
    },
    close() {
      /* Closed, the stream hands over nothing more: events it had buffered
         reached the reader after close(), into a state that had moved on. */
      void iter.return?.();
    },
    get status() {
      return state.current;
    },
    get dropped() {
      return queue.dropped;
    },
    on(_event: "status", handler: (status: ConnectionStatus) => void) {
      return state.subscribe(handler);
    },
  };
}

function linkSignal(external: AbortSignal | undefined, controller: AbortController): void {
  if (!external) return;
  if (external.aborted) {
    controller.abort();
  } else {
    external.addEventListener("abort", () => controller.abort(), { once: true });
  }
}
