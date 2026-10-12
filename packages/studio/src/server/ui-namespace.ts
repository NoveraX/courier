/**
 * Socket.IO `/ui` namespace handler — manages Studio UI connections.
 *
 * Owns the UI side of every Studio↔runtime conversation: on connect Studio's
 * version and the project's name, the binding-table snapshot and the project
 * Studio runs (its imports, its sources and how the config loads), then
 * mock-server lifecycle, watcher status, and the rid-keyed playground
 * request flows. Routing to the runtimes flows through the `/runtime`
 * `BindingTable` + `runtimeRegistry`.
 */

import { logger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import { buildBindingSnapshot } from "./binding-snapshot";
import type { BindingTable } from "./catalog/binding-table";
import { clearedMockOf } from "./mock-log-clear";
import type { LifecycleCoordinator } from "./mock-manager";
import type { CommandReply } from "./mock-manager/command-replies";
import { sendProject } from "./project-state/send-project";
import type { ProjectImports } from "./project-state/types";
import type { RequestLog } from "./request-log";
import { keptIdsOf } from "./request-log-clear";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { sanitizeMockCommand, sanitizeMockManaged } from "./sanitize-mock-events";
import type { MockLog } from "./storage/mock-log";
import type { PageState } from "./storage/page-state";
import type { PlaygroundHistory } from "./storage/playground-history";
import type { RequestPins } from "./storage/request-pins";
import type { SessionStore } from "./storage/session-rows";
import type { StudioView } from "./storage/studio-view";
import { type StudioInfo, studioInfo } from "./studio-info";
import type { StudioToken } from "./studio-token";
import type { StudioDemo } from "./types";
import { bindBodies } from "./ui-bodies";
import { bindPageState } from "./ui-page-state";
import { bindPlaygroundHistory } from "./ui-playground-history";
import { bindRequestPins } from "./ui-request-pins";
import { guardUiWrites, type VisitorPolicy } from "./ui-token-guard";
import { bindView } from "./ui-view";
import type { WatcherStatus } from "./watcher-status";

export interface SetupUiNamespaceDeps {
  uiNamespace: Namespace;
  bindingTable: BindingTable;
  /** The project Studio runs, replayed to each UI that connects. */
  project: ProjectImports;
  /** The project root, symlinks resolved. */
  projectRoot: string;
  mockManager?: LifecycleCoordinator;
  watcherStatus?: WatcherStatus;
  playgroundRouter?: RuntimePlaygroundRouter;
  /** The requests captured so far, replayed to each UI that connects. */
  requestLog?: RequestLog;
  /** The saved sessions, for the one the pages show. */
  sessions?: SessionStore;
  /** What the pages show: the live requests, or a saved session. */
  view?: StudioView;
  /** The requests the mocks answered, replayed to each UI that connects. */
  mockLog?: MockLog;
  /** The Playground's calls, sent to each UI that connects and kept as they change. */
  playgroundHistory?: PlaygroundHistory;
  /**
   * The token a UI presents, as `auth.token` of its handshake, to change
   * anything; one that presents none still receives everything it shows.
   */
  token: StudioToken;
  /** What a page without the token may send; Studio's own rule, to read only, unless given. */
  visitors?: VisitorPolicy | undefined;
  /** How Studio runs as a public demo, which each page is told. */
  demo?: StudioDemo | undefined;
  /** The room Studio's database takes on disk, which each page is told as it connects. */
  databaseSize?: (() => number) | undefined;
  /** What the pages keep in the project: their settings, drafts and progress. */
  pageState?: PageState | undefined;
  /** The requests pinned on the pages. */
  pins?: RequestPins | undefined;
}

/**
 * Serve each Studio UI that connects: replay the state it needs, then take
 * its playground and mock commands.
 *
 * @param deps - The namespace, and what is replayed and commanded
 *
 * @example
 * ```ts
 * setupUiNamespace({ uiNamespace, bindingTable, project, projectRoot, mockManager, watcherStatus });
 * ```
 */
export function setupUiNamespace(deps: SetupUiNamespaceDeps): void {
  const { uiNamespace, bindingTable, mockManager, watcherStatus, playgroundRouter, requestLog } =
    deps;
  const { sessions, view, mockLog, playgroundHistory } = deps;
  const { project, projectRoot, token, visitors, demo, databaseSize, pageState, pins } = deps;
  /* Read once: the version cannot change while Studio runs, and a renamed
     package shows after a restart. */
  const info: StudioInfo = { ...studioInfo(projectRoot), ...(demo && { demo }) };

  uiNamespace.on("connection", (socket) => {
    const trusted = guardUiWrites(socket, token, visitors);
    socket.emit("studio:info", info);
    if (pageState) bindPageState(socket, pageState, trusted);
    // Send current binding-table snapshot so a UI client that joins after a
    // runtime has already announced gets the live state without waiting for
    // the next `runtime:announce`. This is the source of truth for the
    // status-bar runtime/source counts. Wrapped defensively so a corrupt
    // table never crashes the connect handler — the UI store has a sane
    // empty initial slice and will catch up on the next live broadcast.
    try {
      socket.emit("binding:snapshot", buildBindingSnapshot(bindingTable));
    } catch (err) {
      logger.warn("Studio", "Failed to emit initial binding:snapshot on UI connect", err);
      socket.emit("binding:snapshot", { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] });
    }

    /* The imports, the sources and how the config loads, from what Studio
       runs: never a load of its own. A UI that connects while Studio starts
       is told so, and gets the lists with the first outcome. socket.io calls
       this handler outside any promise, so a throw here would stop Studio. */
    try {
      sendProject(socket, project.snapshot(), projectRoot, project.updateChecks);
    } catch (err) {
      logger.warn("Studio", "Failed to send the project to a UI that connected", err);
    }

    // Send managed mock server states
    mockManager?.sendSnapshot(socket);
    /* After the mocks, the requests they answered: a page that reloads shows each mock's log
       again, unless a page cleared that mock's log. */
    if (mockLog) {
      socket.emit("mock:events:replay", mockLog.replayPayload());
      socket.on("mock:logs:clear", (raw: unknown) => {
        const serverId = clearedMockOf(raw);
        if (serverId) mockLog.forget(serverId);
      });
    }

    // Send current watcher status (watching N files indicator)
    watcherStatus?.sendSnapshot(socket);
    if (databaseSize) socket.emit("storage:size", { onDisk: databaseSize() });

    /* The requests captured before this UI connected, so a page that loads
       or reloads shows them. Clearing the log in one page forgets them here
       too, except the ones it keeps. */
    if (requestLog) {
      socket.emit("events:replay", requestLog.replayPayload());
      if (pins) bindRequestPins(socket, pins);
      socket.on("requests:clear", (raw: unknown) => {
        const keep = keptIdsOf(raw);
        if (!keep) return;
        requestLog.forget(keep);
        pins?.retain(keep);
      });
    }

    /* After the live requests: a page that loaded a saved session shows it again. */
    if (sessions && view) bindView(socket, { sessions, view, requestLog });
    if (playgroundHistory) {
      bindPlaygroundHistory(socket, playgroundHistory, { trusted, demo: demo !== undefined });
    }

    // Rid-keyed playground wire — `attachRuntime` callers register a
    // `playground-responder` that speaks the `playground:execute` protocol.
    // The router resolves the binding, dispatches the request, and forwards
    // `playground:chunk` / `playground:end` / `playground:error` back to the
    // originating UI socket. `playground:write` targets the owning runtime
    // directly via the router's `inFlight` map.
    if (playgroundRouter) {
      const router = playgroundRouter;
      socket.on("playground:exec", (raw: unknown) => router.dispatch(socket, raw));
      socket.on("playground:exec:cancel", (raw: unknown) => router.cancel(socket, raw));
      socket.on("playground:write", (raw: unknown) => router.write(socket, raw));
      socket.on("disconnect", () => router.onUiDisconnect(socket.id));
    }

    // Forward mock commands from the UI to the managed mock they name (IPC).
    // A UI that passes an acknowledgement hears whether the mock ran it.
    socket.on("mock:command", async (rawCommand: unknown, ack?: unknown) => {
      const command = sanitizeMockCommand(rawCommand);
      if (!command) return answer(ack, { ok: false, error: "Studio could not read the command." });
      const reply = mockManager?.forwardStoreCommand(command);
      const unknownMock = { ok: false, error: `No mock is named "${command.serverId}".` };
      answer(ack, reply ? await reply : unknownMock);
    });

    /* A request's whole body, which its event carried only a part of. */
    bindBodies(socket, (command) => mockManager?.forwardStoreCommand(command));

    // Managed mock server lifecycle commands
    socket.on("mock:managed", (rawData: unknown) => {
      const data = sanitizeMockManaged(rawData);
      if (!data) return;
      mockManager?.handleCommand(data.command, data);
    });
  });
}

/* The acknowledgement comes from the UI, which may send none. */
function answer(ack: unknown, reply: CommandReply): void {
  if (typeof ack === "function") ack(reply);
}
