import { createLogger } from "../logger";
import { createConnectionState } from "../realtime/connection-state";
import { RealtimeError } from "../realtime/errors";
import { createEventQueue } from "../realtime/sse/event-queue";
import type { ConnectionStatus, SSESubscription } from "../realtime/types";
import { abortableEvents } from "../utils/abortable-events";
import type { StreamGenerator } from "./types";

const log = createLogger("Testing");
const INTERNAL_ERROR = 5000;

/**
 * Create an in-memory SSESubscription from an async generator factory.
 * No real HTTP — the generator yields events directly.
 *
 * It ends as a real subscription does: iteration ends when the generator
 * returns, and rejects when it throws — with the generator's own
 * `RealtimeError`, or with code 5000 for any other error, as a client of a
 * real server reads it — never with nobody listening, which would fail the
 * test run with an unhandled rejection. Leaving the loop early closes the
 * subscription, and events are buffered as a real one buffers them.
 *
 * @param generatorFn - Factory that creates the async generator
 * @param delayMs - Optional delay before the stream starts producing events
 * @returns SSESubscription with full lifecycle support
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
): SSESubscription<TData> {
  const state = createConnectionState();
  const controller = new AbortController();
  const queue = createEventQueue<TData>();

  function finish(error: RealtimeError | undefined): void {
    state.set("disconnected");
    if (error) queue.fail(error);
    else queue.finish();
  }

  void run();

  async function run(): Promise<void> {
    // Defer to next microtask so callers can attach listeners first
    await Promise.resolve();
    state.set("connecting");
    if (delayMs) await sleep(delayMs, controller.signal);
    if (controller.signal.aborted) return finish(undefined);

    state.set("connected");
    try {
      for await (const event of abortableEvents(generatorFn(), controller.signal)) {
        queue.push(event);
      }
      finish(undefined);
    } catch (error) {
      log.warn("Stream handler failed", error);
      const failure =
        error instanceof RealtimeError ? error : new RealtimeError(INTERNAL_ERROR, "Stream failed");
      finish(failure);
    }
  }

  const close = () => controller.abort();
  const iter = queue.iterator(close);

  return {
    [Symbol.asyncIterator]() {
      return iter;
    },
    close,
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, { once: true });
  });
}
