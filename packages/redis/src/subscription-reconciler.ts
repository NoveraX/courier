import type { LoggedPosition } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";

import { SUBSCRIBE_TIMEOUT_MS, settleWithin } from "./adapter-deadlines";
import { channelBatches } from "./channel-batches";
import { createHeldChannels } from "./held-channels";
import { createSerialRuns } from "./serial-runs";
import { createSubscribeAnswers } from "./subscribe-answers";

type Handler = (message: unknown, logged?: LoggedPosition) => void;

/** The subscriptions a pub/sub adapter wants, and those its subscriber connection holds. */
export interface SubscriptionReconciler {
  /** Want a channel for a handler; the returned function stops wanting it for that handler */
  add(channel: string, handler: Handler): () => void;
  /**
   * Want a channel as `add()` does, settling once Redis has answered its
   * SUBSCRIBE on this connection: at once for a channel confirmed, or while
   * the subscriber is not ready — a channel whose UNSUBSCRIBE is out is not
   * confirmed, and waits for the SUBSCRIBE that follows it; as the
   * connection is lost, or the reconciler stops; and after
   * `SUBSCRIBE_TIMEOUT_MS` at the latest. It gives the function that stops
   * wanting the channel for that handler.
   */
  subscribe(channel: string, handler: Handler): Promise<() => void>;
  /** The handlers of a channel the adapter wants, `undefined` for any other */
  handlersOf(channel: string): ReadonlySet<Handler> | undefined;
  /** The subscriber is ready: subscribe every channel wanted and not held, and let go of those no handler wants */
  connected(): void;
  /** The subscriber lost its connection: none is confirmed now, and what it held may be held again on the next */
  disconnected(): void;
  /** Want nothing any more, unsubscribing what is held within `timeoutMs` */
  stop(timeoutMs: number): Promise<void>;
  readonly wanted: number;
  readonly confirmed: number;
  /**
   * Whether the subscriber is getting its channels back: from the start,
   * and from each time its connection is lost, until Redis has answered,
   * on the connection that is ready, the SUBSCRIBE of each channel wanted
   * as it became ready — `SUBSCRIBE_TIMEOUT_MS` after it is ready at the
   * latest
   */
  readonly restoring: boolean;
}

/** What a reconciler tells, and what it draws on. */
export interface ReconcilerOptions {
  /** Told once the subscriber has its channels back, as `restoring` turns false */
  readonly restored?: () => void;
  /** A source of numbers in [0, 1), for the pauses; for tests */
  readonly random?: () => number;
}

/**
 * Keep a subscriber connection's channels as they are wanted. The wish
 * outlives every connection: after each reconnect, and after a SUBSCRIBE
 * Redis refused, the channels wanted and not held are subscribed again —
 * a refusal tried again after a pause that grows with each failure — and
 * every channel the connection may hold and no handler wants is let go:
 * one held, though let go of before Redis answered its SUBSCRIBE; one held
 * as a connection was lost, which ioredis subscribes again on the next; one
 * whose SUBSCRIBE is answered only on the next. Only the connection a reply
 * came on counts a channel as confirmed, so a reply that arrives after a
 * reconnect does not pass for the new connection's, and a channel is
 * confirmed no more from the moment its UNSUBSCRIBE goes out. A subscribe
 * waits for Redis's answer on the connection, within a bound, and so does
 * the connection that is back for the channels wanted as it is.
 *
 * @param subscriber - The connection subscriptions are made on
 * @param report - Told of each command Redis failed
 * @param options - Who is told the channels are back, and the pauses' source of numbers
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
  options: ReconcilerOptions = {},
): SubscriptionReconciler {
  const { restored, random } = options;
  const wanted = new Map<string, Set<Handler>>();
  const holding = createHeldChannels();
  const waits = createSubscribeAnswers();
  /* Each connection the subscriber makes is a generation of its own. */
  let generation = 0;
  let stopped = false;
  let restoring = true;
  const reconciling = createSerialRuns(reconcile, report, random);

  /* Send what brings the channels the connection holds to those wanted; nothing while it is not ready. */
  function reconcile(): Promise<unknown> | undefined {
    if (stopped || subscriber.status !== "ready") return undefined;
    const missing = [...wanted.keys()].filter((channel) => !holding.confirmed.has(channel));
    const stray = holding.strayFrom(wanted);
    if (missing.length === 0 && stray.length === 0) return undefined;
    const sentOn = generation;
    return Promise.all([
      ...channelBatches(missing).map((batch) =>
        subscriber
          .subscribe(...batch)
          .then(() => {
            for (const channel of batch) holding.subscribed(channel, generation === sentOn);
            /* Let go of before Redis answered: held all the same, until it is unsubscribed. */
            if (batch.some((channel) => !wanted.has(channel))) reconciling.soon();
          })
          .finally(() => {
            /* Taken or refused, it was answered: the refusal is tried again later. */
            if (generation === sentOn) for (const channel of batch) waits.answered(channel);
          }),
      ),
      ...channelBatches(stray).map((batch) => {
        /* Out, it may take effect before a subscribe made meanwhile is answered: that one waits
           for the SUBSCRIBE that follows. */
        for (const channel of batch) holding.leaving(channel);
        return subscriber.unsubscribe(...batch).then(() => {
          if (generation === sentOn) for (const channel of batch) holding.unsubscribed(channel);
        });
      }),
    ]);
  }

  /* The channels are back on the connection of generation `connection`, unless it was lost since. */
  function channelsBack(connection: number): void {
    if (stopped || generation !== connection || !restoring) return;
    restoring = false;
    restored?.();
  }

  function add(channel: string, handler: Handler): () => void {
    let handlers = wanted.get(channel);
    if (!handlers) {
      handlers = new Set();
      wanted.set(channel, handlers);
      reconciling.soon();
    }
    const held = handlers;
    held.add(handler);
    return () => {
      if (!held.delete(handler) || held.size > 0 || wanted.get(channel) !== held) return;
      wanted.delete(channel);
      /* No handler wants it: what waited for its answer waits no more. */
      waits.answered(channel);
      reconciling.soon();
    };
  }

  return {
    add,
    async subscribe(channel, handler) {
      const stop = add(channel, handler);
      const answers = !stopped && subscriber.status === "ready" && !holding.confirmed.has(channel);
      if (answers) await waits.wait([channel], SUBSCRIBE_TIMEOUT_MS);
      return stop;
    },
    handlersOf: (channel) => wanted.get(channel),
    connected() {
      generation++;
      const connection = generation;
      const awaited = [...wanted.keys()].filter((channel) => !holding.confirmed.has(channel));
      const answers = awaited.length > 0 ? waits.wait(awaited, SUBSCRIBE_TIMEOUT_MS) : undefined;
      reconciling.now();
      if (answers) void answers.then(() => channelsBack(connection));
      else channelsBack(connection);
    },
    disconnected() {
      generation++;
      restoring = true;
      holding.lost();
      waits.answeredAll();
    },
    async stop(timeoutMs) {
      stopped = true;
      reconciling.stop();
      waits.answeredAll();
      const held = holding.takeAll();
      wanted.clear();
      if (held.length === 0 || subscriber.status !== "ready") return;
      const letGo = channelBatches(held).map((batch) => subscriber.unsubscribe(...batch));
      await settleWithin(Promise.allSettled(letGo), timeoutMs);
    },
    get wanted() {
      return wanted.size;
    },
    get confirmed() {
      return holding.confirmed.size;
    },
    get restoring() {
      return restoring;
    },
  };
}
