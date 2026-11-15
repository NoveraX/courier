import type { AdapterState } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";

/* The client events after which its status may have changed. */
const STATUS_EVENTS = ["ready", "close", "end", "reconnecting"] as const;

/** Where an adapter of several connections stands, and who hears of each change. */
export interface PubSubStateTracker {
  readonly current: AdapterState;
  /** Hear each change; returns the function that stops hearing it */
  onChange(listener: (state: AdapterState) => void): () => void;
  /** Resolve once ready; reject when not ready within `timeoutMs`, or stopped first */
  whenReady(timeoutMs: number): Promise<void>;
  /** Look again at what the state stands on: the clients, and the subscriptions being made again */
  refresh(): void;
  /** Stopped for good: the clients are no longer listened to */
  stop(): void;
}

/**
 * Follow the state of an adapter that needs every one of its connections,
 * and the subscriptions it makes on them: `connecting` until it is first
 * ready, `ready` while every connection is and no subscription is being
 * made again, `degraded` while that is not so after it was ready, and
 * `stopped` once stopped. A listener that throws does not keep the others
 * from hearing.
 *
 * @param clients - The adapter's connections
 * @param report - Told of a listener that threw
 * @param restoring - Whether subscriptions are being made again on a connection that is back; `refresh()` once they are
 * @returns The tracker
 * @example
 * ```ts
 * const state = trackPubSubState([publisher, subscriber], report, () => subscriptions.restoring);
 * state.onChange((next) => next === "ready" && flush());
 * ```
 */
export function trackPubSubState(
  clients: readonly Pick<Redis, "status" | "on" | "off">[],
  report: (error: Error) => void,
  restoring: () => boolean = () => false,
): PubSubStateTracker {
  const listeners = new Set<(state: AdapterState) => void>();
  const allReady = (): boolean =>
    clients.every((client) => client.status === "ready") && !restoring();
  let state: AdapterState = allReady() ? "ready" : "connecting";
  let wasReady = state === "ready";

  function tell(): void {
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        report(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  const update = (): void => {
    if (state === "stopped") return;
    const ready = allReady();
    const next: AdapterState = ready ? "ready" : wasReady ? "degraded" : "connecting";
    wasReady ||= ready;
    if (next === state) return;
    state = next;
    tell();
  };

  for (const client of clients) for (const event of STATUS_EVENTS) client.on(event, update);

  function onChange(listener: (state: AdapterState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    get current() {
      return state;
    },
    onChange,
    whenReady(timeoutMs) {
      if (state === "ready") return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          stop();
          reject(
            new Error(`Redis was not ready within ${timeoutMs} ms; the adapter goes on connecting`),
          );
        }, timeoutMs);
        const stop = onChange((next) => {
          if (next !== "ready" && next !== "stopped") return;
          clearTimeout(timer);
          stop();
          if (next === "ready") resolve();
          else reject(new Error("The Redis pub/sub adapter was stopped before it was ready"));
        });
      });
    },
    refresh: update,
    stop() {
      if (state === "stopped") return;
      for (const client of clients) for (const event of STATUS_EVENTS) client.off(event, update);
      state = "stopped";
      tell();
      listeners.clear();
    },
  };
}
