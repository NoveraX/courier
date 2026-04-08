/**
 * Smart routing for `playground:stream` and `replay` socket events.
 *
 * # Why this exists
 *
 * The Studio server may have multiple connected user-app sockets at once
 * — a Next.js dev server, a standalone `@noverax/nexus-server`, plus any
 * other framework adapter the user runs in parallel. Each app advertises
 * its own `Sources` map via `connection:init`, but the runtime layers
 * may diverge (e.g. only the standalone server hosts WS endpoints, only
 * Next.js hosts the SSE handler).
 *
 * Naive routing (always pick the first non-unknown framework socket)
 * silently mis-routes whenever the requested transport lives on a
 * different app than the one we picked. The user clicks "Subscribe" and
 * gets nothing back, or "Application did not respond within 15s".
 *
 * # What this does
 *
 * Walks every connected app socket and picks the first one whose
 * registered runtime layer hosts the requested `(source, group, method)`
 * endpoint with the matching `transport`. Returns a discriminated
 * `RouteResult` so callers can distinguish:
 *
 *  - `matched`  → exactly one app hosts the endpoint, route to it
 *  - `no-apps`  → zero apps connected (system error)
 *  - `no-host`  → 2+ apps connected but none host the requested endpoint
 *                 (configuration mismatch — surface an actionable error
 *                 listing the connected frameworks)
 *
 * The single-socket case always returns `matched` even when the runtime
 * layer is empty (cold start), because dropping requests on first paint
 * would be worse than letting the executor surface its own clean error.
 *
 * # Forward compatibility
 *
 * Used by both `playground:stream` (`forwardStreamToApp` in
 * `ui-namespace.ts`) and `replay` (`handleReplay` in `ui-replay-handler.ts`).
 * Future work may introduce explicit per-source target
 * selection in the Studio UI and multi-target broadcast for fan-out
 * scenarios — this module is the canonical extension point.
 */

import type { CatalogStore } from "./catalog";
import {
  findSocketHostingEndpoint,
  listAppSockets,
  type PlaygroundStreamPayload,
  runtimeLayerHostsEndpoint,
} from "./resolve-target-socket";
import type { AppNamespace, AppSocket } from "./socket-data";

// Re-export the shared types/helpers so existing call sites and tests that
// import from `playground-stream-routing` keep working unchanged.
export { type PlaygroundStreamPayload, runtimeLayerHostsEndpoint };

/**
 * Result of `pickStreamTargetSocket` — discriminated so callers can
 * distinguish "no apps connected" (system error) from "no app hosts the
 * requested endpoint" (configuration mismatch) from a normal match.
 *
 * Before this discriminator existed, the routing fallback silently picked
 * the first non-`unknown` framework socket even when none of the connected
 * apps hosted the requested transport. The user saw a generic "endpoint
 * not found" error from a downstream executor instead of the actionable
 * "this endpoint is not hosted on any connected app" message.
 */
export type RouteResult =
  | { kind: "matched"; socket: AppSocket }
  | { kind: "no-apps" }
  | { kind: "no-host"; sampledFrameworks: string[] };

/**
 * Pick the best app socket to deliver a `playground:stream` event to.
 *
 * Returns:
 *  - `{ kind: "matched", socket }` when one of the connected apps actually
 *    hosts the requested `(source, group, method, transport)` endpoint
 *    in its runtime layer (or when there is exactly one connected app —
 *    we trust it because the alternative is to drop user requests on
 *    cold-start before the runtime layer is populated)
 *  - `{ kind: "no-apps" }` when zero apps are connected
 *  - `{ kind: "no-host", sampledFrameworks }` when 2+ apps are connected
 *    but none host the requested endpoint — the caller surfaces a clean
 *    error instead of routing to a wrong app and waiting for a downstream
 *    executor failure
 */
export function pickStreamTargetSocket(
  appNamespace: AppNamespace,
  catalogStore: CatalogStore,
  payload: PlaygroundStreamPayload,
): RouteResult {
  const sockets = listAppSockets(appNamespace);
  const first = sockets[0];
  if (!first) return { kind: "no-apps" };
  if (sockets.length === 1) return { kind: "matched", socket: first };

  // Smart match: snapshot all (socket, runtime layer) tuples upfront so a
  // `connection:sources` HMR event landing mid-iteration cannot mutate the
  // catalog under us, then return the first hosting socket.
  const matched = findSocketHostingEndpoint(sockets, catalogStore, payload);
  if (matched) return { kind: "matched", socket: matched };

  // No app hosts the endpoint. Surface a structured error so the caller
  // can build an actionable message instead of falling through to the
  // "first non-unknown framework" heuristic that masks the configuration
  // mismatch.
  const sampledFrameworks = sockets.map((s) => s.data.framework ?? "unknown");
  return { kind: "no-host", sampledFrameworks };
}
