/**
 * Studio-side router for the rid-keyed playground wire used by adapters
 * that attach via `attachRuntime` (their runtime side hosts the
 * `playground-responder`).
 *
 * UI emits `playground:exec { rid, source, group, method, transport, ... }`
 * on the `/ui` namespace; Studio runs a call itself — an agent's replay —
 * through `run`. The router resolves the binding via `BindingTable`, looks
 * up the owning runtime socket in `runtimeRegistry`, tracks the rid →
 * runtime socket ownership in `inFlight`, and forwards the request as
 * `playground:execute` over that socket.
 *
 * The runtime emits `playground:chunk` / `playground:end` / `playground:error`
 * back, all keyed by rid. The router sanitizes each payload (mirroring the
 * UI-side guards for defense-in-depth), verifies it came from the socket the
 * request went to, and hands it to whoever sent the request. Terminal events
 * clear the inFlight entry.
 *
 * A cancel is the router's to settle, since an answer and a cancel can cross
 * on the way: the run ends for its sender the moment it is cancelled — with
 * a `playground:end` that says so — the runtime is told to stop it, and
 * nothing the runtime sends for that rid afterwards is handed on. An HTTP
 * run the runtime leaves unanswered past its timeout is stopped there too.
 *
 * On runtime socket disconnect: end every in-flight rid that socket was
 * serving with a `playground:error` to its sender, then clear the entries —
 * whether or not another process still runs under its runtime id. On UI
 * socket disconnect: emit `playground:cancel` to the runtime side for every
 * in-flight rid owned by that UI socket, then clear the entries.
 *
 * A rid is the UI's to choose, so one already in flight is refused: taking
 * it again handed another UI's stream to whoever sent it.
 */

import type { Namespace, Socket } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { armTimeout, endCancelled, failedAnswer, stopAtRuntime } from "./playground-endings";
import { createPlaygroundForwarders, type PlaygroundForwarders } from "./playground-forwarders";
import {
  type InFlight,
  type InFlightEntry,
  settle,
  settleWhere,
  tellEach,
} from "./playground-in-flight";
import { collectRun, type PlaygroundRunOutcome } from "./playground-run";
import { playgroundTarget } from "./playground-target";
import {
  type PlaygroundExecPayload,
  sanitizeExec,
  sanitizeRidOnly,
  sanitizeWrite,
} from "./runtime-playground-router-sanitize";

export interface RuntimePlaygroundRouter extends PlaygroundForwarders {
  dispatch(uiSocket: Socket, raw: unknown): void;
  /**
   * Run a call for Studio itself — an agent's replay — and settle with what
   * the runtime answered, or why it did not run. A signal that aborts
   * cancels it at the runtime.
   */
  run(call: PlaygroundExecPayload, signal?: AbortSignal): Promise<PlaygroundRunOutcome>;
  cancel(uiSocket: Socket, raw: unknown): void;
  /**
   * Forward a `playground:write { rid, data }` from the UI to the runtime
   * socket serving the rid's live channel, where the responder's `onWrite`
   * listener routes the data into the active `WSChannel`.
   */
  write(uiSocket: Socket, raw: unknown): void;
  /** End, with an error to its sender, every request the runtime socket was serving. */
  onRuntimeDisconnect(runtimeSocketId: string): void;
  onUiDisconnect(uiSocketId: string): void;
  /**
   * End every in-flight entry, telling its sender Studio closed. Called from
   * `createStudioServer.close()` so a server restart in the same process
   * (test suites, HMR) starts from clean state, and a call Studio runs
   * itself does not wait for an answer that cannot come. Per-rid cleanup
   * happens via the terminal-event path; this is the symmetric shutdown drain.
   */
  dispose(): void;
  /**
   * The Playground calls still in flight: the ones a page sent, or every
   * one when none is named.
   */
  callsInFlight(uiSocketId?: string): number;
  /** Test hook — exposes the in-flight map size */
  _inFlightSize(): number;
}

export interface RuntimePlaygroundRouterDeps {
  bindingTable: BindingTable;
  uiNamespace: Namespace;
}

export function createRuntimePlaygroundRouter(
  deps: RuntimePlaygroundRouterDeps,
): RuntimePlaygroundRouter {
  const inFlight: InFlight = new Map();

  const send = (
    sender: string,
    deliver: InFlightEntry["deliver"],
    payload: PlaygroundExecPayload,
  ): void => {
    if (inFlight.has(payload.rid)) {
      deliver(failedAnswer(payload.rid, `A request ${payload.rid} is already in flight`));
      return;
    }
    const target = playgroundTarget(deps.bindingTable, payload);
    if ("refusal" in target) {
      deliver(failedAnswer(payload.rid, target.refusal));
      return;
    }
    const { runtimeId, socket } = target;
    const entry: InFlightEntry = {
      runtimeId,
      runtimeSocket: socket,
      sender,
      deliver,
      transport: payload.transport,
      sentAt: performance.now(),
    };
    if (payload.transport === "http") armTimeout(inFlight, payload.rid, entry);
    inFlight.set(payload.rid, entry);
    /* Which runtime runs the call is Studio's to decide; the runtime is sent the call only. */
    const { runtimeId: _preferred, ...call } = payload;
    socket.emit("playground:execute", call);
  };

  const dispatch = (uiSocket: Socket, raw: unknown): void => {
    const payload = sanitizeExec(raw);
    if (!payload) return;
    send(
      uiSocket.id,
      (answer) => {
        deps.uiNamespace.to(uiSocket.id).emit(answer.event, answer.payload);
      },
      payload,
    );
  };

  const run = (call: PlaygroundExecPayload, signal?: AbortSignal): Promise<PlaygroundRunOutcome> =>
    collectRun({
      start: (deliver) => send(`studio:${call.rid}`, deliver, call),
      cancel: () => {
        const entry = settle(inFlight, call.rid);
        if (entry) stopAtRuntime(call.rid, entry, "cancel the replay at the runtime");
      },
      signal,
    });

  /* The entry the UI socket sent under a rid, if it is still in flight. */
  const sentBy = (uiSocket: Socket, rid: string): InFlightEntry | undefined => {
    const entry = inFlight.get(rid);
    return entry?.sender === uiSocket.id ? entry : undefined;
  };

  return {
    dispatch,
    run,
    cancel: (uiSocket, raw) => {
      const payload = sanitizeRidOnly(raw);
      const entry = payload ? sentBy(uiSocket, payload.rid) : undefined;
      if (payload && entry) endCancelled(inFlight, payload.rid, entry);
    },
    write: (uiSocket, raw) => {
      const payload = sanitizeWrite(raw);
      const entry = payload ? sentBy(uiSocket, payload.rid) : undefined;
      if (payload && entry?.transport === "ws") {
        entry.runtimeSocket.emit("playground:write", { rid: payload.rid, data: payload.data });
      }
    },
    ...createPlaygroundForwarders(inFlight),
    onRuntimeDisconnect: (runtimeSocketId) => {
      const served = settleWhere(inFlight, (e) => e.runtimeSocket.id === runtimeSocketId);
      tellEach(served, "report the runtime's disconnect", (rid, entry) =>
        entry.deliver(failedAnswer(rid, "Runtime disconnected mid-request")),
      );
    },
    onUiDisconnect: (uiSocketId) => {
      const sent = settleWhere(inFlight, (e) => e.sender === uiSocketId);
      tellEach(sent, "cancel on the UI's disconnect", (rid, entry) =>
        entry.runtimeSocket.emit("playground:cancel", { rid }),
      );
    },
    dispose: () => {
      const open = settleWhere(inFlight, () => true);
      tellEach(open, "report Studio closing", (rid, entry) =>
        entry.deliver(failedAnswer(rid, "Studio closed before the runtime answered")),
      );
    },
    callsInFlight: (uiSocketId) => {
      if (uiSocketId === undefined) return inFlight.size;
      let sent = 0;
      for (const entry of inFlight.values()) if (entry.sender === uiSocketId) sent++;
      return sent;
    },
    _inFlightSize: () => inFlight.size,
  };
}
