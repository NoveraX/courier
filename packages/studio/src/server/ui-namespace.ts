/**
 * Socket.IO UI namespace handler — manages studio UI connections.
 *
 * Emits catalog:snapshot on connect and on every catalog change.
 */

import { logger } from "@noverax/nexus";
import type { Namespace } from "socket.io";
import { listSources, loadRegistry } from "../apis/registry/registry";
import { scanProject } from "../apis/scanner";
import { mockServers } from "./app-namespace";
import type { CatalogStore } from "./catalog";
import type { LifecycleCoordinator } from "./mock-manager";
import type { PlaygroundStreamPayload } from "./playground-stream-routing";
import { pickStreamTargetSocket } from "./playground-stream-routing";
import { listAppSockets } from "./resolve-target-socket";
import { sanitizeMockCommand, sanitizeMockManaged } from "./sanitize-mock-events";
import type { AppNamespace } from "./socket-data";
import type { SessionInfo } from "./types";
import { handlePlayground } from "./ui-playground-handler";
import { handleReplay } from "./ui-replay-handler";
import { handleWSSend } from "./ui-ws-send-handler";
import type { WatcherStatus } from "./watcher-status";

export function setupUiNamespace(
  appNamespace: AppNamespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
  mockManager?: LifecycleCoordinator,
  watcherStatus?: WatcherStatus,
): void {
  // Broadcast catalog changes to all connected UI clients
  catalogStore.onChange((snapshot) => {
    uiNamespace.emit("catalog:snapshot", snapshot);
  });

  uiNamespace.on("connection", (socket) => {
    // Send current sessions (without sources — catalog is separate)
    socket.emit("sessions", Array.from(sessions.values()));

    // Send current catalog snapshot
    socket.emit("catalog:snapshot", catalogStore.getSnapshot());

    // Send current scan + registry so APIs page works without HTTP round-trip
    try {
      socket.emit("scan:updated", scanProject());
      socket.emit("registry:updated", { sources: listSources(loadRegistry()) });
    } catch {
      // Scanner/registry may not be configured — non-critical
    }

    // Send current mock servers so UI restores state immediately
    for (const event of mockServers.values()) {
      socket.emit("event", event);
    }

    // Send managed mock server states
    mockManager?.sendSnapshot();

    // Send current watcher status (watching N files indicator)
    watcherStatus?.sendSnapshot(socket);

    // Handle explicit catalog requests (reconnection, gap recovery)
    socket.on("catalog:request", () => {
      socket.emit("catalog:snapshot", catalogStore.getSnapshot());
    });

    socket.on("replay", handleReplay(appNamespace, catalogStore));
    socket.on("playground:send", handlePlayground(appNamespace));
    socket.on("playground:ws:send", handleWSSend(appNamespace));

    // Stream: forward subscribe to the app socket whose runtime layer
    // hosts the requested endpoint with the requested transport.
    // The cancel event is keyed by requestId only — broadcast to every app
    // so the right one finds its active stream and aborts.
    socket.on(
      "playground:stream",
      forwardStreamToApp(appNamespace, catalogStore, "playground:stream"),
    );
    socket.on(
      "playground:stream:cancel",
      broadcastToApps(appNamespace, "playground:stream:cancel"),
    );

    // Forward mock commands from UI → app sockets (external) + managed servers (IPC)
    socket.on("mock:command", (rawCommand: unknown) => {
      const command = sanitizeMockCommand(rawCommand);
      if (!command) return;
      const sockets = listAppSockets(appNamespace);
      for (const appSocket of sockets) {
        appSocket.emit("mock:command", command);
      }
      mockManager?.forwardStoreCommand(command);
    });

    // Managed mock server lifecycle commands
    socket.on("mock:managed", (rawData: unknown) => {
      const data = sanitizeMockManaged(rawData);
      if (!data) return;
      mockManager?.handleCommand(data.command, data);
    });
  });
}

/**
 * Forward a `playground:stream` event to the app socket whose runtime
 * layer hosts the requested (source, group, method, transport) endpoint.
 *
 * Three failure modes are surfaced as distinct error messages instead of
 * silently routing to a wrong app:
 *  - `no-apps`  → no apps connected at all
 *  - `no-host`  → 2+ apps connected but none host the requested endpoint
 *                 (e.g. user clicked Subscribe on an SSE endpoint while
 *                 only WS-only apps are running). Lists the connected
 *                 frameworks so the user knows what they had attached.
 */
function forwardStreamToApp(
  appNamespace: AppNamespace,
  catalogStore: CatalogStore,
  event: string,
): (payload: unknown, callback: (result: unknown) => void) => void {
  return (payload, callback) => {
    const result = pickStreamTargetSocket(
      appNamespace,
      catalogStore,
      payload as PlaygroundStreamPayload,
    );
    if (result.kind === "no-apps") {
      callback({ error: "No application connected" });
      return;
    }
    if (result.kind === "no-host") {
      const p = payload as PlaygroundStreamPayload;
      const transport = p.transport ?? "http";
      const frameworks = result.sampledFrameworks.join(", ");
      callback({
        error: `No connected app hosts ${transport.toUpperCase()} endpoint ${p.source}.${p.group}.${p.method}. Connected apps: ${frameworks}`,
      });
      return;
    }
    result.socket.emit(event, payload, callback);
  };
}

/**
 * Broadcast a fire-and-forget event (no callback expected from the apps)
 * to every connected app socket. Used for `playground:stream:cancel` —
 * we don't know which app owns the requestId so every app inspects its
 * own active streams and either aborts or no-ops.
 *
 * Contract on 0 connected apps: returns `{ error: "No application
 * connected" }`, matching the convention used by `handlePlayground` and
 * `handleReplay`. Cancel is technically idempotent so a silent
 * `{ ok: true }` would also be defensible — but project-wide consistency
 * wins: every UI→app forwarding handler surfaces the same diagnostic when
 * the apps go away, and that gives Studio a single user-visible signal
 * for "your app process exited" instead of three different shapes.
 *
 * Exported for unit testing — production callers wire it through
 * `setupUiNamespace` above.
 *
 * **When NOT to use this**: if the UI needs to know whether the event
 * actually reached an owner (e.g. `playground:ws:send`, where the user
 * pressed a "send" button and expects delivery confirmation), use
 * `broadcastWSSend` from `broadcast-ws-send.ts` instead. That helper
 * collects per-socket acks with a timeout and surfaces the first
 * `ok:true` to the caller.
 */
export function broadcastToApps(
  appNamespace: AppNamespace,
  event: string,
): (payload: unknown, callback: (result: unknown) => void) => void {
  return (payload, callback) => {
    const sockets = listAppSockets(appNamespace);
    if (sockets.length === 0) {
      callback({ error: "No application connected" });
      return;
    }
    // Pass a per-socket ack so older studio-core handlers that expect a
    // third arg don't crash on `undefined.call(...)`, AND so any app
    // returning `{ error }` gets surfaced in the studio log instead of
    // silently swallowed. The aggregate UI response is unchanged because
    // the broadcast pattern is fire-and-forget by contract.
    for (const s of sockets) s.emit(event, payload, makeBroadcastAck(event, s.id));
    callback({ ok: true });
  };
}

/**
 * Per-app ack handler used by `broadcastToApps`. App handlers normally
 * respond with `{ ok: true }` (or no payload at all) — anything carrying an
 * `error` field surfaces a warning so a silently failing app process leaves
 * a trace in the studio log instead of a void. The aggregate UI response is
 * still `{ ok: true }` because the broadcast pattern is fire-and-forget;
 * this is observability, not flow control.
 */
function makeBroadcastAck(event: string, socketId: string): (result?: unknown) => void {
  return (result?: unknown) => {
    if (result && typeof result === "object" && "error" in result) {
      const err = (result as { error: unknown }).error;
      logger.warn("Studio", `broadcast ${event} → app ${socketId} returned error: ${String(err)}`);
    }
  };
}
