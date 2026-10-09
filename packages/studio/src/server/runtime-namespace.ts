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
import type { AnswerObserver } from "./contract-drift/answer-observer";
import { emitLiveEvent } from "./live-events";
import type { AgentCalls } from "./mcp/agent-calls";
import { isRecord } from "./mocks-edit/is-record";
import type { RequestLog } from "./request-log";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { handleAnnounce, handleDisconnect, handleHello } from "./runtime-registration";
import { admitRuntimeSocket } from "./runtime-trust";
import type { StudioToken } from "./studio-token";

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
  /**
   * Counts each answer's shape for its endpoint's contract. The shapes go to
   * no page and no log.
   */
  answers?: AnswerObserver | undefined;
  /** The requests Studio runs for an agent, whose start events are made to name it. */
  agentCalls?: AgentCalls | undefined;
  /**
   * This project's Studio token. A runtime that presents it when it connects
   * is sent Playground calls; any other is only heard.
   */
  token: StudioToken;
  /**
   * The largest message Studio's sockets take, told to each runtime as it
   * says hello: one larger closes the runtime's connection, so the runtime
   * sends a short refusal in its place.
   */
  maxMessageBytes?: number | undefined;
}

export function setupRuntimeNamespace(
  runtimeNamespace: Namespace,
  deps: SetupRuntimeNamespaceDeps,
): void {
  runtimeNamespace.on("connection", (socket) => {
    const ref: { runtimeId: string | undefined } = { runtimeId: undefined };
    const trusted = admitRuntimeSocket(socket, deps.token);
    let warned = trusted;

    socket.on("runtime:hello", (raw: unknown, welcome?: unknown) => {
      handleHello(raw, socket, ref, deps);
      if (typeof welcome === "function") welcome({ maxMessageBytes: deps.maxMessageBytes });
    });

    socket.on("runtime:announce", (raw: unknown) => {
      handleAnnounce(raw, ref, deps);
      if (warned || !ref.runtimeId) return;
      warned = true;
      log.warn(
        `Runtime "${ref.runtimeId}" did not present this project's Studio token: Studio shows ` +
          "its traffic but sends it no Playground calls. A server runtime reads the token " +
          "from .courier/studio-token beside courier.config.",
      );
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
  const attributed = attributeEvent(raw, deps.nameSource);
  /* An answer's shape is counted for its endpoint's contract, and goes no further. */
  if (deps.answers?.see(attributed)) return undefined;
  const event = deps.agentCalls?.stamp(attributed) ?? attributed;
  return broadcastRuntimeEvent(deps.uiNamespace, event, log);
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
