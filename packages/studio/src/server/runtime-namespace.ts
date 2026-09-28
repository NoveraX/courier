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
import { broadcastRuntimeEvent } from "./broadcast-runtime-event";
import type { BindingTable } from "./catalog/binding-table";
import type { ConfigSourceNamer } from "./catalog/config-source-names";
import { mockServers, socketMockServers } from "./runtime-namespace-state";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { handleAnnounce, handleDisconnect, handleHello } from "./runtime-registration";

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
  /**
   * Names the config source an event's call was made against. A runtime
   * reports the name its own copy of the definition carries, which outside
   * the registry is only derived from the baseURL host.
   */
  nameSource?: ConfigSourceNamer;
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
      handleRuntimeEvent(event, socket, deps);
    });

    socket.on("disconnect", () => {
      handleSocketMockCleanup(socket);
      handleDisconnect(socket, ref, deps);
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
function handleRuntimeEvent(raw: unknown, socket: Socket, deps: SetupRuntimeNamespaceDeps): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const event = raw as Record<string, unknown>;
  if (event.type === "mock:server:connect") {
    handleMockServerConnect(event, socket);
  } else if (event.type === "mock:server:disconnect") {
    handleMockServerDisconnect(event, socket);
  } else if (event.type === "mock:network:config") {
    handleMockNetworkConfig(event);
  }
  broadcastRuntimeEvent(deps.uiNamespace, attributed(event, deps.nameSource), log);
}

/** The event with its `source` named by the config key, when it names a call. */
function attributed(
  event: Record<string, unknown>,
  nameSource: ConfigSourceNamer | undefined,
): Record<string, unknown> {
  const { source, group, method } = event;
  if (!nameSource || typeof source !== "string" || typeof method !== "string") return event;
  const named = nameSource({
    source,
    group: typeof group === "string" ? group : undefined,
    method,
  });
  return named === source ? event : { ...event, source: named };
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
