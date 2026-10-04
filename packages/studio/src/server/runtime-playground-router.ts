/**
 * Studio-side router for the rid-keyed playground wire used by adapters
 * that attach via `attachRuntime` (their runtime side hosts the
 * `playground-responder`).
 *
 * UI emits `playground:exec { rid, source, group, method, transport, ... }`
 * on the `/ui` namespace. The router resolves the binding via `BindingTable`,
 * looks up the owning runtime socket in `runtimeRegistry`, tracks the
 * rid → runtime socket ownership in `inFlight`, and forwards the request as
 * `playground:execute` over that socket.
 *
 * The runtime emits `playground:chunk` / `playground:end` / `playground:error`
 * back, all keyed by rid. The router sanitizes each payload (mirroring the
 * UI-side guards for defense-in-depth), verifies it came from the socket the
 * request went to, and forwards to the originating UI socket. Terminal
 * events clear the inFlight entry.
 *
 * On runtime socket disconnect: synthesize a `playground:error` to UI for
 * every in-flight rid that socket was serving, then clear the entries —
 * whether or not another process still runs under its runtime id. On UI
 * socket disconnect: emit `playground:cancel` to the runtime side for every
 * in-flight rid owned by that UI socket, then clear the entries.
 *
 * A rid is the UI's to choose, so one already in flight is refused: taking
 * it again handed another UI's stream to whoever sent it.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace, Socket } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { createPlaygroundForwarders, type PlaygroundForwarders } from "./playground-forwarders";
import {
  type InFlight,
  type InFlightEntry,
  settle,
  settleWhere,
  tellEach,
} from "./playground-in-flight";
import { playgroundTarget } from "./playground-target";
import { sanitizeExec, sanitizeRidOnly, sanitizeWrite } from "./runtime-playground-router-sanitize";

const log = createLogger("Studio");

/**
 * Hard ceiling on HTTP playground request lifetime. A runtime that silently
 * hangs returns a visible `playground:error` instead of a spinning UI
 * forever. SSE and WS requests are NOT timed out at this layer: their
 * natural lifetime is bounded by the user's Unsubscribe action, the
 * runtime responder's `AbortSignal`, or the runtime socket disconnect.
 */
const HTTP_TIMEOUT_MS = 30_000;

export interface RuntimePlaygroundRouter extends PlaygroundForwarders {
  dispatch(uiSocket: Socket, raw: unknown): void;
  cancel(uiSocket: Socket, raw: unknown): void;
  /**
   * Forward a `playground:write { rid, data }` from the UI to the runtime
   * socket serving the rid's live channel, where the responder's `onWrite`
   * listener routes the data into the active `WSChannel`.
   */
  write(uiSocket: Socket, raw: unknown): void;
  /** End, with an error to its UI, every request the runtime socket was serving. */
  onRuntimeDisconnect(runtimeSocketId: string): void;
  onUiDisconnect(uiSocketId: string): void;
  /**
   * Drop every in-flight entry. Called from `createStudioServer.close()` so a
   * server restart in the same process (test suites, HMR) starts from clean
   * state. Per-rid cleanup happens via the terminal-event path; this is the
   * symmetric shutdown drain.
   */
  dispose(): void;
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

  const emitErrorToUi = (uiSocketId: string, rid: string, message: string): void => {
    deps.uiNamespace.to(uiSocketId).emit("playground:error", { rid, error: { message } });
  };

  const armTimeout = (rid: string, entry: InFlightEntry): void => {
    entry.timeout = setTimeout(() => {
      if (inFlight.get(rid) !== entry) return;
      log.warn(
        `playground:exec timeout after ${HTTP_TIMEOUT_MS}ms — rid=${rid} runtime=${entry.runtimeId}`,
      );
      emitErrorToUi(
        entry.uiSocketId,
        rid,
        `Runtime did not respond within ${HTTP_TIMEOUT_MS / 1000}s`,
      );
      settle(inFlight, rid);
    }, HTTP_TIMEOUT_MS);
  };

  const dispatch = (uiSocket: Socket, raw: unknown): void => {
    const payload = sanitizeExec(raw);
    if (!payload) return;
    if (inFlight.has(payload.rid)) {
      emitErrorToUi(uiSocket.id, payload.rid, `A request ${payload.rid} is already in flight`);
      return;
    }
    const target = playgroundTarget(deps.bindingTable, payload);
    if ("refusal" in target) {
      emitErrorToUi(uiSocket.id, payload.rid, target.refusal);
      return;
    }
    const { runtimeId, socket } = target;
    const entry: InFlightEntry = {
      runtimeId,
      runtimeSocket: socket,
      uiSocketId: uiSocket.id,
      transport: payload.transport,
    };
    if (payload.transport === "http") armTimeout(payload.rid, entry);
    inFlight.set(payload.rid, entry);
    /* Which runtime runs the call is Studio's to decide; the runtime is sent the call only. */
    const { runtimeId: _preferred, ...call } = payload;
    socket.emit("playground:execute", call);
  };

  /* The entry the UI socket sent under a rid, if it is still in flight. */
  const sentBy = (uiSocket: Socket, rid: string): InFlightEntry | undefined => {
    const entry = inFlight.get(rid);
    return entry?.uiSocketId === uiSocket.id ? entry : undefined;
  };

  return {
    dispatch,
    cancel: (uiSocket, raw) => {
      const payload = sanitizeRidOnly(raw);
      if (payload)
        sentBy(uiSocket, payload.rid)?.runtimeSocket.emit("playground:cancel", {
          rid: payload.rid,
        });
    },
    write: (uiSocket, raw) => {
      const payload = sanitizeWrite(raw);
      const entry = payload ? sentBy(uiSocket, payload.rid) : undefined;
      if (payload && entry?.transport === "ws") {
        entry.runtimeSocket.emit("playground:write", { rid: payload.rid, data: payload.data });
      }
    },
    ...createPlaygroundForwarders(inFlight, deps.uiNamespace),
    onRuntimeDisconnect: (runtimeSocketId) => {
      const served = settleWhere(inFlight, (e) => e.runtimeSocket.id === runtimeSocketId);
      tellEach(served, "report the runtime's disconnect", (rid, entry) =>
        emitErrorToUi(entry.uiSocketId, rid, "Runtime disconnected mid-request"),
      );
    },
    onUiDisconnect: (uiSocketId) => {
      const sent = settleWhere(inFlight, (e) => e.uiSocketId === uiSocketId);
      tellEach(sent, "cancel on the UI's disconnect", (rid, entry) =>
        entry.runtimeSocket.emit("playground:cancel", { rid }),
      );
    },
    dispose: () => {
      settleWhere(inFlight, () => true);
    },
    _inFlightSize: () => inFlight.size,
  };
}
