import { createLogger } from "@noverax/courier";
import { createRefusalLog } from "@noverax/courier/internal";
import type { AdapterState, PubSubAdapter, PubSubEnvelope } from "@noverax/courier/realtime";

import { CONNECT_TIMEOUT_MS, DISCONNECT_TIMEOUT_MS } from "./adapter-deadlines";
import { createOutboundQueue } from "./outbound-queue";
import { trackPubSubState } from "./pubsub-state";
import { createOutbound, stoppedError } from "./redis-outbound";
import { createRedisTopicLog } from "./redis-topic-log";
import { createSubscriptionReconciler } from "./subscription-reconciler";
import type { RedisPubSubConfig } from "./types";
import { envelopeOf } from "./wire-guards";

const log = createLogger("RedisPubSub");

/**
 * Redis Pub/Sub adapter for horizontal WS scaling, on two connections: one
 * publishes, the other subscribes.
 *
 * It works from the moment it is made, connected to Redis or not: while
 * Redis is away what is published waits in a queue bounded by count,
 * bytes and age — the oldest dropped past them, counted in `stats()` and
 * logged — and is sent in order once Redis is back; every subscription
 * asked for is made as soon as Redis answers, made again after each
 * reconnect, and tried again after a pause when Redis refuses it.
 * `connect()` waits until both connections are ready; `disconnect()`
 * settles within its deadline whatever Redis does, and leaves the two
 * clients, which are yours, open.
 *
 * With `log`, it keeps a log of each topic's events in Redis, which
 * numbers them in one sequence for every replica: a WebSocket handler then
 * publishes a topic's events through it, and resumes subscriptions from it
 * on any replica. What is appended waits with what is published.
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisPubSub } from "@noverax/courier-redis";
 *
 * const pubsub = createRedisPubSub({ publisher: new Redis(), subscriber: new Redis() });
 * await pubsub.connect().catch((error) => console.warn(error.message));
 * ```
 */
export function createRedisPubSub(config: RedisPubSubConfig): PubSubAdapter {
  const { publisher, subscriber, prefix = "" } = config;
  const origin = config.origin ?? crypto.randomUUID();
  const queue = createOutboundQueue(config.queue);
  const errorHandlers = new Set<(error: Error) => void>();
  const refusals = createRefusalLog("RedisPubSub");
  const counts = { published: 0, delivered: 0, dropped: 0 };

  /* Nobody listening is no reason to lose the error: it is logged instead. */
  const report = (error: Error): void => {
    if (errorHandlers.size === 0)
      refusals.warn({ event: "redis error", code: codeOf(error) }, error);
    for (const handler of [...errorHandlers]) handler(error);
  };
  const state = trackPubSubState([publisher, subscriber], report);
  const subscriptions = createSubscriptionReconciler(subscriber, report);
  const stopped = () => state.current === "stopped";
  /* Behind what waits, in order, until the "ready" that sends it. */
  const { dispatch, flush, drop } = createOutbound({
    publisher,
    queue,
    counts,
    refusals,
    report,
    stopped,
  });

  const deliver = (channel: string, raw: string): void => {
    /* Another adapter's channel, on a subscriber connection two share, or one let go of. */
    const handlers = subscriptions.handlersOf(channel);
    if (!handlers) return;
    const envelope = envelopeOf(raw);
    if (!envelope) {
      report(new Error(`Not a Courier message on channel "${channel}"`));
      return;
    }
    /* A replica's own events reach it too, once the log has numbered them. */
    if (envelope.origin === origin && !envelope.logged) return;
    for (const handler of [...handlers]) {
      counts.delivered++;
      try {
        handler(envelope.payload, envelope.logged);
      } catch (error) {
        report(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  const connected = (): void => subscriptions.connected();
  const lost = (): void => subscriptions.disconnected();
  publisher.on("ready", flush);
  publisher.on("error", report);
  subscriber.on("ready", connected);
  subscriber.on("close", lost);
  subscriber.on("end", lost);
  subscriber.on("message", deliver);
  subscriber.on("error", report);
  if (subscriber.status === "ready") subscriptions.connected();
  /* A client made with lazyConnect waits for a command, which this adapter
     sends only once it is ready; why it could not connect reaches "error". */
  for (const client of [publisher, subscriber]) {
    if (client.status === "wait") client.connect().catch(() => undefined);
  }

  let previous = state.current;
  state.onChange((next: AdapterState) => {
    if (next === "degraded") {
      const why = "what is published waits, and subscriptions are made again once it is back";
      refusals.warn({ event: "redis connection lost", code: "DEGRADED" }, why);
    } else if (next === "ready" && previous === "degraded") {
      log.info("Redis connection restored");
    }
    previous = next;
  });

  const outlet = { publisher, prefix, origin, dispatch };
  const topicLog = config.log && createRedisTopicLog(outlet, config.log);

  return {
    log: topicLog,
    get state() {
      return state.current;
    },
    async connect(options) {
      if (state.current === "stopped") throw stoppedError();
      await state.whenReady(options?.timeoutMs ?? CONNECT_TIMEOUT_MS);
    },
    async disconnect(options) {
      if (state.current === "stopped") return;
      state.stop();
      drop(queue.clear(), "STOPPED");
      subscriber.off("message", deliver);
      await subscriptions.stop(options?.timeoutMs ?? DISCONNECT_TIMEOUT_MS);
      publisher.off("ready", flush);
      publisher.off("error", report);
      subscriber.off("ready", connected);
      subscriber.off("close", lost);
      subscriber.off("end", lost);
      subscriber.off("error", report);
      errorHandlers.clear();
    },
    isHealthy: () => state.current === "ready",
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onStateChange: (listener) => state.onChange(listener),
    async publish(topic, message) {
      if (state.current === "stopped") throw stoppedError();
      const envelope: PubSubEnvelope = { origin, payload: message, timestamp: Date.now() };
      const payload = JSON.stringify(envelope);
      const command = () => publisher.publish(prefix + topic, payload);
      return dispatch(command, Buffer.byteLength(payload));
    },
    async subscribe(topic, handler) {
      if (state.current === "stopped") throw stoppedError();
      return subscriptions.add(prefix + topic, handler);
    },
    stats: () => ({
      state: state.current,
      channels: { wanted: subscriptions.wanted, confirmed: subscriptions.confirmed },
      queued: { messages: queue.messages, bytes: queue.bytes },
      dropped: counts.dropped,
      published: counts.published,
      delivered: counts.delivered,
    }),
  };
}

function codeOf(error: Error): string {
  return "code" in error && typeof error.code === "string" && error.code !== ""
    ? error.code
    : error.name;
}
