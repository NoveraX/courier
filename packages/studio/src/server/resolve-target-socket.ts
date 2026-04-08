/**
 * Shared socket-resolution primitives used by both routing strategies in the
 * Studio server:
 *
 *  - `playground-stream-routing.ts` — picks the app socket whose runtime
 *    layer hosts a `(source, group, method, transport)` endpoint, used by
 *    `playground:stream` and `replay`.
 *  - `ui-playground-handler.ts` — picks the app socket for an HTTP
 *    `playground:execute` request based on `mode` (direct vs proxy) and an
 *    optional sticky `sessionId` from the UI.
 *
 * Before this module existed both files duplicated the
 * `Array.from(appNamespace.sockets.values())` walk and the "find by
 * sessionId" lookup. A maintainer who fixed one path would silently regress
 * the other. Both paths now consume `listAppSockets`,
 * `findSocketBySession`, and `findSocketHostingEndpoint` from here so any
 * future change to socket selection lives in one place.
 *
 * `findSocketHostingEndpoint` snapshots `(socket, runtimeLayer)` tuples
 * upfront so a `connection:sources` HMR event landing mid-iteration
 * cannot mutate the catalog under our feet.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { CatalogStore } from "./catalog";
import type { AppNamespace, AppSocket } from "./socket-data";

/**
 * Routing payload accepted by the stream/replay smart router. The optional
 * `transport` discriminates HTTP from SSE/WS endpoints — see
 * {@link runtimeLayerHostsEndpoint}.
 */
export interface PlaygroundStreamPayload {
  source: string;
  group: string;
  method: string;
  transport?: "sse" | "ws";
}

/**
 * Pure check used by the live router and unit tests. True iff the runtime
 * layer hosts the requested `(source, group, method)` endpoint with the
 * matching transport. HTTP endpoints (no `transport` field on the entry)
 * match when the payload also has no transport.
 */
export function runtimeLayerHostsEndpoint(
  layer: SourceMap,
  payload: PlaygroundStreamPayload,
): boolean {
  const sourceEntry = layer[payload.source];
  if (!sourceEntry) return false;

  const groupEntry = sourceEntry.groups[payload.group];
  if (!groupEntry) return false;

  const endpoint = groupEntry.endpoints[payload.method];
  if (!endpoint) return false;

  if (payload.transport) return endpoint.transport === payload.transport;
  return !endpoint.transport;
}

/** Snapshot the current set of connected app sockets. */
export function listAppSockets(appNamespace: AppNamespace): AppSocket[] {
  return Array.from(appNamespace.sockets.values());
}

/** Find a socket by its bound `sessionId`, if any. */
export function findSocketBySession(
  sockets: readonly AppSocket[],
  sessionId: string,
): AppSocket | undefined {
  return sockets.find((s) => s.data.sessionId === sessionId);
}

/**
 * Pick the app socket for an HTTP `playground:execute` request.
 *
 * Mode-driven heuristic (NOT applicable to WS send — `ui-ws-send-handler.ts`
 * uses a broadcast pattern instead because requestId ownership can be on
 * either side):
 *
 * - `sessionId` provided → sticky lookup wins.
 * - `preferServer: true` (direct mode) → server session preferred because
 *   runtime sources live there. A server session has a real framework
 *   name; the browser bundle reports `"unknown"`.
 * - `preferServer: false` (proxy mode) → browser session preferred so the
 *   request flows through the user's `/api/request` route exactly like a
 *   real visitor would.
 *
 * Returns `undefined` only when `sockets` is empty. Callers must check
 * that case and produce their own user-facing error.
 */
export function pickExecutionSocket(
  sockets: readonly AppSocket[],
  opts: { sessionId?: string; preferServer: boolean },
): AppSocket | undefined {
  if (sockets.length === 0) return undefined;

  if (opts.sessionId) {
    const found = findSocketBySession(sockets, opts.sessionId);
    if (found) return found;
  }

  if (opts.preferServer) {
    const serverSocket = sockets.find((s) => s.data.framework && s.data.framework !== "unknown");
    if (serverSocket) return serverSocket;
    // length > 0 verified above; index access is safe.
    return sockets[0] as AppSocket;
  }

  // Proxy mode (or no server connected): prefer the LAST socket — browser
  // sessions reconnect on every HMR cycle, so the newest entry is the
  // currently-attached browser tab.
  return sockets[sockets.length - 1] as AppSocket;
}

/**
 * Find the first socket whose runtime layer hosts the requested endpoint.
 *
 * Snapshots `(socket, layer)` tuples BEFORE filtering — a `connection:sources`
 * HMR event landing in the middle of the search cannot change which layer
 * we evaluated for which socket. Sockets without a `sessionId` (handshake
 * not yet completed) are skipped.
 */
export function findSocketHostingEndpoint(
  sockets: readonly AppSocket[],
  catalogStore: CatalogStore,
  payload: PlaygroundStreamPayload,
): AppSocket | undefined {
  const snapshot: Array<{ socket: AppSocket; layer: SourceMap | undefined }> = sockets.map((s) => {
    const sessionId = s.data.sessionId;
    return {
      socket: s,
      layer: sessionId ? catalogStore.getRuntimeLayer(sessionId) : undefined,
    };
  });

  for (const entry of snapshot) {
    if (entry.layer && runtimeLayerHostsEndpoint(entry.layer, payload)) {
      return entry.socket;
    }
  }
  return undefined;
}
