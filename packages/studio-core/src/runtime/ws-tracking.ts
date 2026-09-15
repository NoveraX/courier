/**
 * WebSocket subscription tracking for real (non-playground) WS connections.
 *
 * Populated by `studioHooks.onWSTrack` / `onWSUntrack` callbacks (wired in
 * `runtime/hooks/stream.ts`) so the Studio UI knows which `requestId`s
 * correspond to active WS subscriptions on which `connectionId`s. The data
 * survives bundler module duplication via `globalThis` `Symbol.for` —
 * Turbopack/webpack/Vite HMR all funnel through the same registries.
 *
 * Lifecycle:
 *  - `trackWSStream(requestId, connectionId, topic)` — called when a real
 *    user-app subscribes to a WS topic (server adapters' WS handlers fire
 *    `studioHooks.onWSTrack` from `instrumentWSChannel`)
 *  - `untrackWSStream(requestId)` — called when the WS channel closes; drops
 *    every subscription registered under that `requestId`
 *
 * The legacy `playground-ws-send.ts` module also kept an in-process
 * `playgroundChannelRegistry` Map for the callback-based playground WS
 * outbound dispatch. That registry died with the legacy callback wire —
 * outbound playground WS now flows through `playground-responder.ts` via
 * the rid-keyed `playground:write` event, with the `WSChannel` reference
 * stored in the responder's per-request `inFlight` map. There is no longer
 * a global playground channel registry.
 */

const CONNECTION_MAP_KEY = Symbol.for("courier.studio.playground-ws-connection-map");
const SUBSCRIPTION_SET_KEY = Symbol.for("courier.studio.playground-ws-subscription-set");
const g = globalThis as Record<symbol, unknown>;

if (!g[CONNECTION_MAP_KEY]) g[CONNECTION_MAP_KEY] = new Map<string, string>();
if (!g[SUBSCRIPTION_SET_KEY]) g[SUBSCRIPTION_SET_KEY] = new Set<string>();

/** `requestId → connectionId` (one WS connection serves one Studio requestId). */
const connectionMap = g[CONNECTION_MAP_KEY] as Map<string, string>;

/** Set of `${requestId}:${topic}` compound keys for currently-tracked subscriptions. */
const subscriptionSet = g[SUBSCRIPTION_SET_KEY] as Set<string>;

function subKey(requestId: string, topic: string): string {
  return `${requestId}:${topic}`;
}

/** Track an active WS subscription on a real (canonical) connection. */
export function trackWSStream(requestId: string, connectionId: string, topic: string): void {
  connectionMap.set(requestId, connectionId);
  subscriptionSet.add(subKey(requestId, topic));
}

/** Untrack every subscription previously associated with `requestId`. */
export function untrackWSStream(requestId: string): void {
  connectionMap.delete(requestId);
  const prefix = `${requestId}:`;
  for (const key of subscriptionSet) {
    if (key.startsWith(prefix)) subscriptionSet.delete(key);
  }
}

/** Reset all tracking state — for tests only. */
export function _resetWSTrackingForTests(): void {
  connectionMap.clear();
  subscriptionSet.clear();
}
