import { createLogger } from "../logger";
import { RealtimeError } from "../realtime/errors";
import type { SubscriptionSink } from "../realtime/subscription-driver";
import { SubscriptionHandle } from "../realtime/subscription-handle";
import type { Subscription } from "../realtime/subscription-types";
import { abortableEvents } from "../utils/abortable-events";
import { ONCE } from "../utils/own";
import type { StreamGenerator } from "./types";

const log = createLogger("Testing");
const INTERNAL_ERROR = 5000;

/**
 * Create an in-memory subscription from an async generator factory.
 * No real HTTP — the generator yields events directly.
 *
 * It ends as a real subscription does: iteration ends when the generator
 * returns, and rejects when it throws — with the generator's own
 * `RealtimeError`, or with code 5000 for any other error, as a client of a
 * real server reads it — never with nobody listening, which would fail the
 * test run with an unhandled rejection. Leaving the loop early closes the
 * subscription, events are buffered as a real one buffers them, and
 * `reconnect()` after it ended runs the generator again.
 *
 * @param generatorFn - Factory that creates the async generator
 * @param delayMs - Optional delay before the stream starts producing events
 * @returns The subscription, read with `on("data")` or `for await`
 *
 * @example
 * ```ts
 * const sub = createMockSSESubscription(async function* () {
 *   yield { data: { text: "hello" }, id: "1" };
 * });
 * for await (const event of sub) { ... }
 * ```
 */
export function createMockSSESubscription<TData>(
  generatorFn: StreamGenerator<TData>,
  delayMs?: number,
): Subscription<TData> {
  let controller = new AbortController();
  return new SubscriptionHandle<TData>({
    open: (sink) => void run(sink),
    reopen: (sink) => {
      controller = new AbortController();
      void run(sink);
    },
    reconnect: () => undefined,
    close: () => controller.abort(),
  });

  async function run(sink: SubscriptionSink<TData>): Promise<void> {
    const { signal } = controller;
    /* A stream over the network opens after it is made, never as it is made. */
    await Promise.resolve();
    if (delayMs) await sleep(delayMs, signal);
    if (signal.aborted) return;
    sink.open({ resumed: false });
    try {
      for await (const event of abortableEvents(generatorFn(), signal)) sink.data(event);
      if (!signal.aborted) sink.end();
    } catch (error) {
      if (signal.aborted) return;
      log.warn("Stream handler failed", error);
      sink.end(
        error instanceof RealtimeError ? error : new RealtimeError(INTERNAL_ERROR, "Stream failed"),
      );
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, ONCE);
  });
}
