import { generateRequestId } from "../studio";
import type { WSSocketContext } from "./ws-context";

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
 * Close a per-subscription stream entry and clean up tracking.
 * No-op if the entry has already been closed (idempotent).
 *
 * @param ctx - Per-connection socket context
 * @param topic - Topic identifier whose subscription should be closed
 * @param reason - Close reason reported to Studio (defaults to "complete")
 */
export function closeSubscriptionEntry(
  ctx: WSSocketContext,
  topic: string,
  reason: SubscriptionCloseReason = "complete",
): void {
  const sub = ctx.subscriptionIds.get(topic);
  if (!sub) return;
  // Claim ownership before firing hooks: deleting first ensures any
  // re-entrant call (e.g. a hook that triggers another close) finds an
  // empty slot and short-circuits at the guard above. Without this,
  // two callers in the same microtask both pass the guard and double-fire.
  ctx.subscriptionIds.delete(topic);
  ctx.dt.onWSUntrack?.({ requestId: sub.requestId });
  ctx.dt.onStreamClose?.({
    requestId: sub.requestId,
    reason,
    eventCount: sub.seq.value,
    totalBytes: 0,
    duration: performance.now() - sub.t0,
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
 */
export function openSubscriptionEntry(
  ctx: WSSocketContext,
  topic: string,
  endpoint: { source: string; group?: string; method: string },
): string {
  const requestId = ctx.playgroundRequestId ?? generateRequestId();
  ctx.subscriptionIds.set(topic, { requestId, seq: { value: 0 }, t0: performance.now() });
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
  return requestId;
}
