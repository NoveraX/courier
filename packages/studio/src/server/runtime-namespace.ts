/**
 * Studio `/runtime` Socket.IO namespace.
 *
 * Each connected runtime (Next.js server entry, browser bundle, standalone
 * Hono server, …) opens one socket here via `attachRuntime` from
 * `@noverax/courier-studio-core/runtime`. The runtime then sends:
 *
 *   - `runtime:hello`    — once on connect, identifies the runtime
 *   - `runtime:announce` — possibly many times, declares which sources it
 *                          hosts on which transports
 *
 * Studio updates the `BindingTable` on every announce and detaches the
 * runtime from the table on disconnect. The playground router reads
 * `BindingTable.resolveBinding()` to pick the runtime that should serve a
 * given playground request.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace, Socket } from "socket.io";
import {
  handleMockNetworkConfig,
  handleMockServerConnect,
  handleMockServerDisconnect,
} from "./app-namespace-mock-handlers";
import { buildBindingSnapshot } from "./binding-snapshot";
import { broadcastRuntimeEvent } from "./broadcast-runtime-event";
import type { BindingTable } from "./catalog/binding-table";
import { BindingConflictError } from "./catalog/binding-table";
import {
  mockServers,
  registerRuntime,
  socketMockServers,
  unregisterRuntime,
  updateRuntimeClaim,
} from "./runtime-namespace-state";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { sanitizeRuntimeAnnounce, sanitizeRuntimeHello } from "./sanitize-runtime-events";

const log = createLogger("Studio");

export interface SetupRuntimeNamespaceDeps {
  bindingTable: BindingTable;
  /** Optional UI namespace used to surface `binding:error` events. */
  uiNamespace?: Namespace;
  /**
   * Optional playground router. When supplied, the runtime namespace forwards
   * `playground:chunk` / `playground:end` / `playground:error` from the
   * runtime side onto the matching UI socket and synthesizes errors for any
   * in-flight rid when the runtime socket disconnects.
   */
  playgroundRouter?: RuntimePlaygroundRouter;
}

export function setupRuntimeNamespace(
  runtimeNamespace: Namespace,
  deps: SetupRuntimeNamespaceDeps,
): void {
  runtimeNamespace.on("connection", (socket) => {
    const ref: { runtimeId: string | undefined } = { runtimeId: undefined };

    socket.on("runtime:hello", (raw: unknown) => {
      handleHello(raw, socket, ref);
    });

    socket.on("runtime:announce", (raw: unknown) => {
      handleAnnounce(raw, ref, deps);
    });

    if (deps.playgroundRouter) {
      const router = deps.playgroundRouter;
      socket.on("playground:chunk", (raw: unknown) => router.forwardChunk(raw, ref.runtimeId));
      socket.on("playground:end", (raw: unknown) => router.forwardEnd(raw, ref.runtimeId));
      socket.on("playground:error", (raw: unknown) => router.forwardError(raw, ref.runtimeId));
    }

    socket.on("event", (event: unknown) => {
      handleRuntimeEvent(event, socket, deps.uiNamespace);
    });

    socket.on("disconnect", () => {
      handleSocketMockCleanup(socket);
      handleDisconnect(ref, deps);
    });
  });
}

/**
 * Dispatch a generic `event` payload arriving on the `/runtime` namespace.
 *
 * Handles the mock-server lifecycle subset (`mock:server:connect/disconnect`,
 * `mock:network:config`) and then broadcasts the raw event to the UI
 * namespace via `broadcastRuntimeEvent` — the single canonical funnel for
 * every event the UI consumes. Identity and topology information ride on
 * the `runtime:hello` + `runtime:announce` handshake instead.
 */
function handleRuntimeEvent(
  raw: unknown,
  socket: Socket,
  uiNamespace: Namespace | undefined,
): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const event = raw as Record<string, unknown>;
  if (event.type === "mock:server:connect") {
    handleMockServerConnect(event, socket);
  } else if (event.type === "mock:server:disconnect") {
    handleMockServerDisconnect(event, socket);
  } else if (event.type === "mock:network:config") {
    handleMockNetworkConfig(event);
  }
  broadcastRuntimeEvent(uiNamespace, event, log);
}

/**
 * Release every mock-server entry owned by `socket.id` on disconnect, so a
 * runtime that crashes mid-session does not leak ghost mock servers in the
 * registry.
 */
function handleSocketMockCleanup(socket: Socket): void {
  const owned = socketMockServers.get(socket.id);
  if (!owned) return;
  for (const serverId of owned) {
    mockServers.delete(serverId);
  }
  socketMockServers.delete(socket.id);
}

function handleHello(raw: unknown, socket: Socket, ref: { runtimeId: string | undefined }): void {
  const hello = sanitizeRuntimeHello(raw);
  if (!hello) {
    log.warn("Rejected malformed runtime:hello payload");
    return;
  }
  ref.runtimeId = hello.runtimeId;
  registerRuntime({
    runtimeId: hello.runtimeId,
    kind: hello.kind,
    socket,
    transports: [],
    sourceNames: [],
    // The sanitized hello payload may carry `listenOrigin` directly — adopt it
    // immediately so a runtime that never sends `runtime:announce` (e.g. one
    // that hosts no transports yet still wants to appear in the registry) is
    // still resolvable for the playground "resolved URL" badge.
    ...(hello.listenOrigin && { listenOrigin: hello.listenOrigin }),
  });
}

function handleAnnounce(
  raw: unknown,
  ref: { runtimeId: string | undefined },
  deps: SetupRuntimeNamespaceDeps,
): void {
  if (!ref.runtimeId) {
    log.warn("Rejected runtime:announce before runtime:hello");
    return;
  }
  const announce = sanitizeRuntimeAnnounce(raw);
  if (!announce) {
    log.warn("Rejected malformed runtime:announce payload");
    return;
  }
  // Re-attach with the new claim — detach first so a runtime that drops a
  // source between announces does not keep stale ownership in the table.
  deps.bindingTable.detachRuntime(ref.runtimeId);
  deps.bindingTable.attachRuntime(ref.runtimeId, announce.transports, announce.sources);
  updateRuntimeClaim(ref.runtimeId, announce.transports, announce.sources, {
    listenOrigin: announce.listenOrigin,
    framework: announce.framework,
  });
  emitBindingSnapshot(deps);
}

function handleDisconnect(
  ref: { runtimeId: string | undefined },
  deps: SetupRuntimeNamespaceDeps,
): void {
  const runtimeId = ref.runtimeId;
  if (!runtimeId) return;
  ref.runtimeId = undefined;
  // Synthesize errors for any playground requests still in-flight on this
  // runtime BEFORE the registry entry is removed — the router needs the
  // mapping intact to find the originating UI sockets.
  deps.playgroundRouter?.onRuntimeDisconnect(runtimeId);
  unregisterRuntime(runtimeId);
  deps.bindingTable.detachRuntime(runtimeId);
  emitBindingSnapshot(deps);
}

function emitBindingSnapshot(deps: SetupRuntimeNamespaceDeps): void {
  if (!deps.uiNamespace) return;
  try {
    deps.uiNamespace.emit("binding:snapshot", buildBindingSnapshot(deps.bindingTable));
  } catch (err) {
    if (err instanceof BindingConflictError) {
      deps.uiNamespace.emit("binding:error", {
        kind: "conflict",
        details: err.context,
      });
      return;
    }
    log.warn("Failed to emit binding:snapshot", err);
  }
}
