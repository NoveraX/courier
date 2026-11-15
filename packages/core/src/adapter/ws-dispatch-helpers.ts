import { generateRequestId } from "../studio";
import type { SubscriptionTracker, WSSocketContext } from "./ws-context";
import type { WSSubscriptionEntry } from "./ws-types";

/**
 * Shared helpers for WS dispatch handlers.
 *
 * Pure helpers used across subscribe/message/unsubscribe handlers:
 * - header extraction for Studio request tracking
 * - per-subscription stream-entry teardown + Studio close events
 */

/** Snapshot Headers into a plain record (used for Studio request tracking) */
export function extractHeaders(h: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  h.forEach((v, k) => {
    rec[k] = v;
  });
  return rec;
}

/** Close reason reported to Studio when a subscription stream ends. */
export type SubscriptionCloseReason =
  | "complete"
  | "error"
  | "disconnect"
  | "shutdown"
  | "max_lifetime";

/**
 * Close Studio's record of one subscription, as that subscription ends.
 * A record is closed once: closed already, or never opened, it is left as
 * it is. What ends a subscription closes that one's record, never the
 * topic's: a subscription to the same topic made since has its own.
 *
 * @param ctx - Per-connection socket context
 * @param record - The subscription's record, as `openSubscriptionEntry` gave it
 * @param reason - Close reason reported to Studio (defaults to "complete")
 * @example
 * ```ts
 * closeSubscriptionEntry(ctx, entry.record, "error");
 * ```
 */
export function closeSubscriptionEntry(
  ctx: WSSocketContext,
  record: SubscriptionTracker | undefined,
  reason: SubscriptionCloseReason = "complete",
): void {
  /* Claimed before the hooks fire: a close they set off again finds it closed. */
  if (record === undefined || !ctx.records.delete(record)) return;
  ctx.dt.onWSUntrack?.({ requestId: record.requestId });
  ctx.dt.onStreamClose?.({
    requestId: record.requestId,
    reason,
    eventCount: record.seq.value,
    totalBytes: 0,
    duration: performance.now() - record.t0,
    timestamp: Date.now(),
  });
}

/**
 * Start Studio's tracking of a subscription, before its handler runs so the
 * data it sends while joining is already tracked.
 *
 * Studio Playground proxy mode pre-allocates a requestId on the browser side
 * and forwards it via `?_playground_rid=<id>` on the upgrade URL; it is used
 * as the subscription's requestId so its events correlate back to the
 * playground tab. Other connections get a fresh id.
 *
 * @param ctx - Per-connection socket context
 * @param endpoint - The endpoint subscribed to
 * @returns The subscription's record, for its entry to hold and its end to close
 * @example
 * ```ts
 * const record = openSubscriptionEntry(ctx, { source: "api", group: "chat", method: "room" });
 * ```
 */
export function openSubscriptionEntry(
  ctx: WSSocketContext,
  endpoint: { source: string; group?: string | undefined; method: string },
): SubscriptionTracker {
  const requestId = ctx.playgroundRequestId ?? generateRequestId();
  const record: SubscriptionTracker = { requestId, seq: { value: 0 }, t0: performance.now() };
  ctx.records.add(record);
  ctx.dt.onStreamOpen?.({
    requestId,
    source: endpoint.source,
    group: endpoint.group,
    method: endpoint.method,
    transport: "ws",
    mode: "proxy",
    timestamp: Date.now(),
    requestHeaders: extractHeaders(ctx.request.headers),
  });
  return record;
}

/**
 * Hold a subscription as its connection's to its topic. Two subscribes to
 * one topic can open side by side: the one it takes the place of is ended,
 * and Studio's record of that one is closed with it.
 *
 * @param ctx - Per-connection socket context
 * @param entry - The subscription, with Studio's record of it
 * @example
 * ```ts
 * holdSubscription(ctx, { topic, authorized, record, cleanup: () => ended.abort() });
 * ```
 */
export function holdSubscription(ctx: WSSocketContext, entry: WSSubscriptionEntry): void {
  closeSubscriptionEntry(ctx, ctx.topicManager.subscribe(ctx.connectionId, entry)?.record);
}
