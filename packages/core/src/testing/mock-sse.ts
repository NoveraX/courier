import { createConnectionState } from "../realtime/connection-state";
import type { ConnectionStatus, SSEEvent, SSESubscription } from "../realtime/types";
import type { StreamGenerator } from "./types";

/**
 * Create an in-memory SSESubscription from an async generator factory.
 * No real HTTP — the generator yields events directly.
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
  const buffer: SSEEvent<TData>[] = [];
  let finished = false;
  let resolve: (() => void) | null = null;

  void runStream();

  async function runStream(): Promise<void> {
    // Defer to next microtask so callers can attach listeners first
    await Promise.resolve();
    state.set("connecting");

    if (delayMs) {
      await sleep(delayMs, controller.signal);
      if (controller.signal.aborted) return void state.set("disconnected");
    }

    state.set("connected");
    const gen = generatorFn();

    try {
      for await (const event of gen) {
        if (controller.signal.aborted) break;
        buffer.push(event);
        resolve?.();
        resolve = null;
      }
    } finally {
      // Ensure generator is closed if we broke out early
      if (controller.signal.aborted) await gen.return(undefined);
      finished = true;
      resolve?.();
      resolve = null;
      state.set("disconnected");
    }
  }

  async function* iterate(): AsyncGenerator<SSEEvent<TData>, void, unknown> {
    let cursor = 0;

    while (true) {
      if (controller.signal.aborted) return;
      const event = buffer[cursor];
      if (event) {
        cursor++;
        yield event;
        continue;
      }
      if (finished) return;
      await new Promise<void>((r) => {
        resolve = r;
        controller.signal.addEventListener("abort", () => r(), { once: true });
      });
    }
  }

  const iter = iterate();

  return {
    [Symbol.asyncIterator]() {
      return iter;
    },
    close() {
      controller.abort();
    },
    get status() {
      return state.current;
    },
    get dropped() {
      return 0;
    },
    on(_event: "status", handler: (status: ConnectionStatus) => void) {
      return state.subscribe(handler);
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((r) => {
    const timer = setTimeout(r, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        r();
      },
      { once: true },
    );
  });
}
