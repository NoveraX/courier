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
 *   - `runtime:webhooks` — the webhooks its application defines, which a
 *                          trusted runtime is asked to deliver
 *
 * Its traffic arrives as `events`: every event a turn of its event loop
 * reported, in one message.
 *
 * Studio updates the `BindingTable` on every announce and detaches the
 * runtime from the table on disconnect. The playground router reads
 * `BindingTable.resolveBinding()` to pick the runtime that should serve a
 * given playground request.
 */

import { createLogger } from "@noverax/courier";
import { isRecord } from "@noverax/courier-cli/devkit";
import type { Namespace, Socket } from "socket.io";
import { attributeEvent } from "./attribute-event";
import { broadcastRuntimeEvents } from "./broadcast-runtime-event";
import type { BindingTable } from "./catalog/binding-table";
import type { ConfigSourceNamer } from "./catalog/config-source-names";
import type { AnswerObserver } from "./contract-drift/answer-observer";
import { emitLiveEvents } from "./live-events";
import type { AgentCalls } from "./mcp/agent-calls";
import type { RequestLog } from "./request-log";
import { runtimeEventsOf } from "./runtime-events-of";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { handleAnnounce, handleDisconnect, handleHello } from "./runtime-registration";
import { admitRuntimeSocket } from "./runtime-trust";
import { withShownErrorTexts } from "./shown-error-texts";
import type { StudioToken } from "./studio-token";
import type { WebhookDirectory } from "./webhooks/webhook-directory";

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
   * The webhooks each trusted runtime says its application defines: such a
   * runtime is asked to deliver one, signed with the application's secret.
   */
  webhooks?: WebhookDirectory | undefined;
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

    socket.on("runtime:webhooks", (raw: unknown) => {
      if (trusted && ref.runtimeId) deps.webhooks?.announce(socket, ref.runtimeId, raw);
    });

    if (deps.playgroundRouter) {
      const router = deps.playgroundRouter;
      socket.on("playground:chunk", (raw: unknown) => router.forwardChunk(raw, socket.id));
      socket.on("playground:end", (raw: unknown) => router.forwardEnd(raw, socket.id));
      socket.on("playground:error", (raw: unknown) => router.forwardError(raw, socket.id));
    }

    let unreadable = false;
    socket.on("events", (raw: unknown) => {
      const events = runtimeEventsOf(raw);
      if (events) {
        for (const event of handleRuntimeEvents(events, deps))
          deps.requestLog?.record(event, socket.id);
        return;
      }
      if (unreadable) return;
      unreadable = true;
      log.warn(
        `Runtime "${ref.runtimeId ?? socket.id}" sent events Studio could not read; they are not shown.`,
      );
    });

    socket.on("disconnect", () => {
      deps.webhooks?.forget(socket);
      endOpenRequests(socket, deps);
      handleDisconnect(socket, ref, deps);
    });
  });
}

/**
 * Pass on the events a `/runtime` message carried: each with its error's
 * text cut, named after the config source its call was made against, an
 * answer's shape counted for its endpoint's contract and going no further,
 * an agent's call named — then all of them to the UI namespace through
 * `broadcastRuntimeEvents`, the single canonical funnel for every event
 * the UI consumes. Identity and topology ride on the `runtime:hello` +
 * `runtime:announce` handshake instead.
 */
function handleRuntimeEvents(
  raws: readonly unknown[],
  deps: SetupRuntimeNamespaceDeps,
): Record<string, unknown>[] {
  const passed: Record<string, unknown>[] = [];
  for (const raw of raws) {
    if (!isRecord(raw) || Array.isArray(raw)) continue;
    const attributed = attributeEvent(withShownErrorTexts(raw), deps.nameSource);
    if (deps.answers?.see(attributed)) continue;
    passed.push(deps.agentCalls?.stamp(attributed) ?? attributed);
  }
  return broadcastRuntimeEvents(deps.uiNamespace, passed, log);
}

/**
 * End the requests and streams a runtime socket leaves open. The runtime can
 * no longer say how they ended — what it sends while disconnected is
 * dropped — so the UI would show them pending for good.
 */
function endOpenRequests(socket: Socket, deps: SetupRuntimeNamespaceDeps): void {
  if (!deps.uiNamespace) return;
  emitLiveEvents(deps.uiNamespace, deps.requestLog?.endOpen(socket.id) ?? []);
}
