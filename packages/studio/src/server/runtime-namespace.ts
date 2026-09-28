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
import { attributeEvent } from "./attribute-event";
import { broadcastRuntimeEvent } from "./broadcast-runtime-event";
import type { BindingTable } from "./catalog/binding-table";
import type { ConfigSourceNamer } from "./catalog/config-source-names";
import { emitLiveEvent } from "./live-events";
import { isRecord } from "./mocks-edit/is-record";
import type { RequestLog } from "./request-log";
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
   * in-flight rid the runtime socket was serving when it disconnects.
   */
  playgroundRouter?: RuntimePlaygroundRouter;
  /**
   * Names the config source an event's call was made against. A runtime
   * reports the name its own copy of the definition carries, which outside
   * the registry is only derived from the baseURL host.
   */
  nameSource?: ConfigSourceNamer;
  /**
   * Optional request log. When supplied, every request event passed to the
   * UI is kept in it, and the requests a runtime socket leaves open when it
   * disconnects are ended.
   */
  requestLog?: RequestLog;
}

export function setupRuntimeNamespace(
  runtimeNamespace: Namespace,
  deps: SetupRuntimeNamespaceDeps,
): void {
  runtimeNamespace.on("connection", (socket) => {
    const ref: { runtimeId: string | undefined } = { runtimeId: undefined };

    socket.on("runtime:hello", (raw: unknown) => {
      handleHello(raw, socket, ref, deps);
    });

    socket.on("runtime:announce", (raw: unknown) => {
      handleAnnounce(raw, ref, deps);
    });

    if (deps.playgroundRouter) {
      const router = deps.playgroundRouter;
      socket.on("playground:chunk", (raw: unknown) => router.forwardChunk(raw, socket.id));
      socket.on("playground:end", (raw: unknown) => router.forwardEnd(raw, socket.id));
      socket.on("playground:error", (raw: unknown) => router.forwardError(raw, socket.id));
    }

    socket.on("event", (event: unknown) => {
      const sent = handleRuntimeEvent(event, deps);
      if (sent) deps.requestLog?.record(sent, socket.id);
    });

    socket.on("disconnect", () => {
      endOpenRequests(socket, deps);
      handleDisconnect(socket, ref, deps);
    });
  });
}

/**
 * Dispatch a generic `event` payload arriving on the `/runtime` namespace:
 * broadcast it to the UI namespace via `broadcastRuntimeEvent` — the single
 * canonical funnel for every event the UI consumes. Identity and topology
 * information ride on the `runtime:hello` + `runtime:announce` handshake
 * instead.
 */
function handleRuntimeEvent(
  raw: unknown,
  deps: SetupRuntimeNamespaceDeps,
): Record<string, unknown> | undefined {
  if (!isRecord(raw) || Array.isArray(raw)) return undefined;
  return broadcastRuntimeEvent(deps.uiNamespace, attributeEvent(raw, deps.nameSource), log);
}

/**
 * End the requests and streams a runtime socket leaves open. The runtime can
 * no longer say how they ended — what it sends while disconnected is
 * dropped — so the UI would show them pending for good.
 */
function endOpenRequests(socket: Socket, deps: SetupRuntimeNamespaceDeps): void {
  if (!deps.uiNamespace) return;
  for (const event of deps.requestLog?.endOpen(socket.id) ?? []) {
    emitLiveEvent(deps.uiNamespace, event);
  }
}
