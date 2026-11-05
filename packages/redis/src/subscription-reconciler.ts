import type { LoggedPosition } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";

import { retryDelay } from "./retry-delay";

type Handler = (message: unknown, logged?: LoggedPosition) => void;

/** Channels sent in one SUBSCRIBE or UNSUBSCRIBE, so a large set is no single huge command. */
const BATCH = 500;

/** The subscriptions a pub/sub adapter wants, and those its subscriber connection holds. */
export interface SubscriptionReconciler {
  /** Want a channel for a handler; the returned function stops wanting it for that handler */
  add(channel: string, handler: Handler): () => void;
  /** The handlers of a channel the adapter wants, `undefined` for any other */
  handlersOf(channel: string): ReadonlySet<Handler> | undefined;
  /** The subscriber is ready: subscribe every channel wanted and not held */
  connected(): void;
  /** The subscriber lost its connection: it holds no channel now */
  disconnected(): void;
  /** Want nothing any more, unsubscribing what is held within `timeoutMs` */
  stop(timeoutMs: number): Promise<void>;
  readonly wanted: number;
  readonly confirmed: number;
}

/**
 * Keep a subscriber connection's channels as they are wanted. The wish
 * outlives every connection: after each reconnect, and after a SUBSCRIBE
 * Redis refused, the channels wanted and not held are subscribed again —
 * a refusal tried again after a pause that grows with each failure — and
 * held ones no longer wanted are let go. Only the connection a reply came
 * on counts it as held, so a reply that arrives after a reconnect does not
 * pass for the new connection's.
 *
 * @param subscriber - The connection subscriptions are made on
 * @param report - Told of each command Redis failed
 * @param random - A source of numbers in [0, 1), for the pauses; for tests
 * @returns The reconciler
 * @example
 * ```ts
 * const subscriptions = createSubscriptionReconciler(subscriber, report);
 * subscriber.on("ready", () => subscriptions.connected());
 * ```
 */
export function createSubscriptionReconciler(
  subscriber: Pick<Redis, "status" | "subscribe" | "unsubscribe">,
  report: (error: Error) => void,
  random: () => number = Math.random,
): SubscriptionReconciler {
  const wanted = new Map<string, Set<Handler>>();
  const confirmed = new Set<string>();
  /* Each connection the subscriber makes is a generation of its own. */
  let generation = 0;
  let running = false;
  let again = false;
  let queued = false;
  let stopped = false;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function soon(): void {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      reconcile();
    });
  }

  function reconcile(): void {
    if (stopped || subscriber.status !== "ready") return;
    if (running) {
      again = true;
      return;
    }
    const missing = [...wanted.keys()].filter((channel) => !confirmed.has(channel));
    const stray = [...confirmed].filter((channel) => !wanted.has(channel));
    if (missing.length === 0 && stray.length === 0) return;
    running = true;
    const sentOn = generation;
    const sent = [
      ...batches(missing).map((batch) =>
        subscriber.subscribe(...batch).then(() => {
          if (generation !== sentOn) return;
          for (const channel of batch) if (wanted.has(channel)) confirmed.add(channel);
        }),
      ),
      ...batches(stray).map((batch) =>
        subscriber.unsubscribe(...batch).then(() => {
          if (generation === sentOn) for (const channel of batch) confirmed.delete(channel);
        }),
      ),
    ];
    Promise.all(sent)
      .then(
        () => {
          failures = 0;
        },
        (error: unknown) => {
          report(error instanceof Error ? error : new Error(String(error)));
          tryAgainLater();
        },
      )
      .finally(() => {
        running = false;
        if (!again) return;
        again = false;
        reconcile();
      });
  }

  function tryAgainLater(): void {
    if (retry !== undefined || stopped) return;
    retry = setTimeout(
      () => {
        retry = undefined;
        reconcile();
      },
      retryDelay(failures++, random),
    );
    if (typeof retry === "object" && "unref" in retry) retry.unref();
  }

  return {
    add(channel, handler) {
      let handlers = wanted.get(channel);
      if (!handlers) {
        handlers = new Set();
        wanted.set(channel, handlers);
        soon();
      }
      const held = handlers;
      held.add(handler);
      return () => {
        if (!held.delete(handler) || held.size > 0 || wanted.get(channel) !== held) return;
        wanted.delete(channel);
        soon();
      };
    },
    handlersOf: (channel) => wanted.get(channel),
    connected() {
      generation++;
      reconcile();
    },
    disconnected() {
      generation++;
      confirmed.clear();
    },
    async stop(timeoutMs) {
      stopped = true;
      clearTimeout(retry);
      const held = [...confirmed];
      wanted.clear();
      confirmed.clear();
      if (held.length === 0 || subscriber.status !== "ready") return;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(batches(held).map((batch) => subscriber.unsubscribe(...batch))),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(deadline);
    },
    get wanted() {
      return wanted.size;
    },
    get confirmed() {
      return confirmed.size;
    },
  };
}

function batches(channels: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let start = 0; start < channels.length; start += BATCH) {
    out.push(channels.slice(start, start + BATCH));
  }
  return out;
}
