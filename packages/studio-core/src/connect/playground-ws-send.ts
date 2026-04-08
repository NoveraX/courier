/**
 * Playground WS send handler — routes a `playground:ws:send` socket event
 * to the right destination.
 *
 * Two paths:
 *
 * 1. **In-process channel** (registered via `executeWSChannel` →
 *    `registerPlaygroundChannel`). The Playground tab opened a WS endpoint
 *    via the canonical in-process pipeline (`executeDirectWSChannel`); the
 *    resulting `WSChannel` lives in `playgroundChannelRegistry`. We just
 *    call `channel.send(data)` — `instrumentWSChannel` automatically emits
 *    the outbound `stream:message`, schema validation runs, and the server's
 *    `handlers.onMessage` is invoked.
 *
 * 2. **Real WS connection** (canonical `nexus-server` WS handler). When a
 *    user's running app subscribes to a WS topic and Studio is monitoring,
 *    `studioHooks.onWSTrack` populates `connectionMap` so the Playground can
 *    send into the live connection via `studioHooks.sendWSMessage`.
 *
 * The two paths are mutually exclusive per requestId — playground-launched
 * streams take the first path; user-app subscriptions take the second.
 */

import { studioHooks } from "@noverax/nexus";
import type { WSChannel } from "@noverax/nexus/realtime";

/**
 * Process-global registries for the Playground WS send dispatcher.
 *
 * All three collections (the in-process channel map, the canonical-WS
 * connection map, and the subscription set) live on `globalThis` via
 * `Symbol.for` so they survive Turbopack / webpack module duplication
 * and HMR reloads. Without this, every Next.js code change would create
 * fresh module instances with empty collections, leaving old WSChannels
 * dangling and `playground:ws:send` events from the new module unable
 * to find connections registered by the old module. Same pattern as
 * `playgroundAbortRegistry`, `studioHooks`, and `appOrigin`.
 */
const CHANNEL_REGISTRY_KEY = Symbol.for("nexus.studio.playground-channel-registry");
const CONNECTION_MAP_KEY = Symbol.for("nexus.studio.playground-ws-connection-map");
const SUBSCRIPTION_SET_KEY = Symbol.for("nexus.studio.playground-ws-subscription-set");
const g = globalThis as Record<symbol, unknown>;

if (!g[CHANNEL_REGISTRY_KEY]) g[CHANNEL_REGISTRY_KEY] = new Map<string, WSChannel>();
if (!g[CONNECTION_MAP_KEY]) g[CONNECTION_MAP_KEY] = new Map<string, string>();
if (!g[SUBSCRIPTION_SET_KEY]) g[SUBSCRIPTION_SET_KEY] = new Set<string>();

// ── In-process Playground channel registry ──────────────────────────────────

const playgroundChannelRegistry = g[CHANNEL_REGISTRY_KEY] as Map<string, WSChannel>;

/** Register an in-process channel created by `executeWSChannel`. */
export function registerPlaygroundChannel(requestId: string, channel: WSChannel): void {
  playgroundChannelRegistry.set(requestId, channel);
}

/** Unregister a previously registered in-process channel. */
export function unregisterPlaygroundChannel(requestId: string): void {
  playgroundChannelRegistry.delete(requestId);
}

/** Number of currently registered in-process Playground channels (for tests). */
export function playgroundChannelCount(): number {
  return playgroundChannelRegistry.size;
}

// ── Canonical WS connection tracking (real, non-playground) ─────────────────

/** connectionId for a requestId (one WS connection = one requestId). */
const connectionMap = g[CONNECTION_MAP_KEY] as Map<string, string>;

/** Set of compound keys "requestId:topic" for active subscriptions. */
const subscriptionSet = g[SUBSCRIPTION_SET_KEY] as Set<string>;

function subKey(requestId: string, topic: string): string {
  return `${requestId}:${topic}`;
}

/** Track an active WS subscription on a real (canonical) connection. */
export function trackWSStream(requestId: string, connectionId: string, topic: string): void {
  connectionMap.set(requestId, connectionId);
  subscriptionSet.add(subKey(requestId, topic));
}

/** Untrack all subscriptions for a requestId (connection closed). */
export function untrackWSStream(requestId: string): void {
  connectionMap.delete(requestId);
  const prefix = `${requestId}:`;
  for (const key of subscriptionSet) {
    if (key.startsWith(prefix)) subscriptionSet.delete(key);
  }
}

// ── Send dispatch ───────────────────────────────────────────────────────────

/** Result shape returned via the socket callback. */
export interface PlaygroundWSSendResult {
  ok: boolean;
  error?: string;
}

/** Handle a `playground:ws:send` socket event. */
export function handlePlaygroundWSSend(
  payload: { requestId: string; topic: string; data: unknown },
  callback: (result: PlaygroundWSSendResult) => void,
): void {
  // Path 1 — in-process Playground channel.
  const channel = playgroundChannelRegistry.get(payload.requestId);
  if (channel) {
    void deliverInProcess(channel, payload, callback);
    return;
  }

  // Path 2 — canonical WS connection (real subscription monitored by Studio).
  const connectionId = connectionMap.get(payload.requestId);
  if (!connectionId) {
    callback({ ok: false, error: `No active connection for requestId: ${payload.requestId}` });
    return;
  }
  if (!subscriptionSet.has(subKey(payload.requestId, payload.topic))) {
    callback({ ok: false, error: `Not subscribed to topic: ${payload.topic}` });
    return;
  }

  const sender = studioHooks.sendWSMessage;
  if (!sender) {
    callback({ ok: false, error: "No WSHandler initialized — sendWSMessage not available" });
    return;
  }

  const sent = sender(connectionId, payload.topic, payload.data);
  callback(sent ? { ok: true } : { ok: false, error: "Connection not found or closed" });
}

/**
 * Deliver a message into an in-process channel and report the outcome.
 *
 * On send failure (validation reject, onMessage throw) the channel is
 * unregistered so subsequent retries on the same requestId surface a clean
 * "no active connection" error instead of routing to a dead channel.
 *
 * The `callbackFired` flag enforces the "exactly one callback" contract
 * defensively: even if a future refactor (or a misbehaving WSChannel that
 * resolves and rejects the same promise via a thenable) routes execution
 * through both the success and the catch branches, the result is reported
 * at most once. Subsequent attempts are silently dropped.
 */
async function deliverInProcess(
  channel: WSChannel,
  payload: { requestId: string; topic: string; data: unknown },
  callback: (result: PlaygroundWSSendResult) => void,
): Promise<void> {
  let callbackFired = false;
  const fire = (result: PlaygroundWSSendResult): void => {
    if (callbackFired) return;
    callbackFired = true;
    callback(result);
  };

  try {
    // The WSChannel contract types `send` as `void`, but the in-process
    // implementation is async (it awaits schema.receive validation and the
    // server's onMessage handler). Wrap with Promise.resolve so we observe
    // both sync throws and async rejections through the same try/catch.
    await Promise.resolve(channel.send(payload.data) as void | Promise<void>);
    fire({ ok: true });
  } catch (err) {
    unregisterPlaygroundChannel(payload.requestId);
    fire({ ok: false, error: err instanceof Error ? err.message : "send failed" });
  }
}
