/**
 * Studio-side router for the rid-keyed playground wire used by adapters
 * that attach via `attachRuntime` (their runtime side hosts the
 * `playground-responder`).
 *
 * UI emits `playground:exec { rid, source, group, method, transport, ... }`
 * on the `/ui` namespace. The router resolves the binding via `BindingTable`,
 * looks up the owning runtime socket in `runtimeRegistry`, tracks the
 * rid → runtime ownership in `inFlight`, and forwards the request as
 * `playground:execute` over the runtime socket.
 *
 * The runtime emits `playground:chunk` / `playground:end` / `playground:error`
 * back, all keyed by rid. The router sanitizes each payload (mirroring the
 * UI-side guards for defense-in-depth), verifies runtime ownership, and
 * forwards to the originating UI socket. Terminal events clear the inFlight
 * entry.
 *
 * On runtime socket disconnect: synthesize a `playground:error` to UI for
 * every in-flight rid owned by that runtime, then clear the entries. On UI
 * socket disconnect: emit `playground:cancel` to the runtime side for every
 * in-flight rid owned by that UI socket, then clear the entries.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace, Socket } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { getRuntimeEntry } from "./runtime-namespace-state";
import {
  sanitizeChunk,
  sanitizeEnd,
  sanitizeError,
  sanitizeExec,
  sanitizeRidOnly,
  sanitizeWrite,
} from "./runtime-playground-router-sanitize";

const log = createLogger("Studio");

/**
 * Hard ceiling on HTTP playground request lifetime. A runtime that silently
 * hangs returns a visible `playground:error` instead of a spinning UI
 * forever. SSE and WS requests are NOT timed out at this layer: their
 * natural lifetime is bounded by the user's Unsubscribe action, the
 * runtime responder's `AbortSignal`, or the runtime socket disconnect.
 */
const HTTP_TIMEOUT_MS = 30_000;

interface InFlightEntry {
  runtimeId: string;
  uiSocketId: string;
  transport: "http" | "sse" | "ws";
  /** Armed for HTTP requests only — cleared on terminal event or cancel. */
  timeout?: NodeJS.Timeout;
}

export interface RuntimePlaygroundRouter {
  dispatch(uiSocket: Socket, raw: unknown): void;
  cancel(uiSocket: Socket, raw: unknown): void;
  /**
   * Forward a `playground:write { rid, data }` from the UI to the runtime
   * that owns the rid's live channel. The router looks up ownership via
   * `inFlight`, validates the UI socket match, and emits
   * `playground:write` over the runtime socket where the responder's
   * `onWrite` listener routes the data into the active `WSChannel`.
   */
  write(uiSocket: Socket, raw: unknown): void;
  forwardChunk(raw: unknown, runtimeId: string | undefined): void;
  forwardEnd(raw: unknown, runtimeId: string | undefined): void;
  forwardError(raw: unknown, runtimeId: string | undefined): void;
  onRuntimeDisconnect(runtimeId: string): void;
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
  const inFlight = new Map<string, InFlightEntry>();

  const emitErrorToUi = (uiSocketId: string, rid: string, message: string): void => {
    deps.uiNamespace.to(uiSocketId).emit("playground:error", { rid, error: { message } });
  };

  const dispatch = (uiSocket: Socket, raw: unknown): void => {
    const payload = sanitizeExec(raw);
    if (!payload) return;

    let binding: ReturnType<BindingTable["resolveBinding"]>;
    try {
      binding = deps.bindingTable.resolveBinding(payload.source, payload.transport);
    } catch (err) {
      emitErrorToUi(
        uiSocket.id,
        payload.rid,
        err instanceof Error ? err.message : "Internal error",
      );
      log.error(`dispatch: binding resolution failed — rid=${payload.rid}`, err);
      return;
    }

    if (!binding) {
      emitErrorToUi(
        uiSocket.id,
        payload.rid,
        `No runtime hosts ${payload.source} on ${payload.transport.toUpperCase()}`,
      );
      return;
    }

    const entry = getRuntimeEntry(binding.runtimeId);
    if (!entry) {
      emitErrorToUi(uiSocket.id, payload.rid, `Runtime ${binding.runtimeId} is not connected`);
      return;
    }

    if (!entry.socket.connected) {
      emitErrorToUi(uiSocket.id, payload.rid, `Runtime ${binding.runtimeId} is not reachable`);
      log.warn(
        `dispatch: runtime socket disconnected — rid=${payload.rid} runtime=${binding.runtimeId}`,
      );
      return;
    }

    const inFlightEntry: InFlightEntry = {
      runtimeId: binding.runtimeId,
      uiSocketId: uiSocket.id,
      transport: payload.transport,
    };

    if (payload.transport === "http") {
      inFlightEntry.timeout = setTimeout(() => {
        const current = inFlight.get(payload.rid);
        if (!current) return;
        log.warn(
          `playground:exec timeout after ${HTTP_TIMEOUT_MS}ms — rid=${payload.rid} runtime=${binding.runtimeId} source=${payload.source} transport=${payload.transport}`,
        );
        emitErrorToUi(
          current.uiSocketId,
          payload.rid,
          `Runtime did not respond within ${HTTP_TIMEOUT_MS / 1000}s`,
        );
        inFlight.delete(payload.rid);
      }, HTTP_TIMEOUT_MS);
    }

    inFlight.set(payload.rid, inFlightEntry);
    entry.socket.emit("playground:execute", payload);
  };

  const cancel = (uiSocket: Socket, raw: unknown): void => {
    const payload = sanitizeRidOnly(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry || entry.uiSocketId !== uiSocket.id) return;
    const runtimeEntry = getRuntimeEntry(entry.runtimeId);
    runtimeEntry?.socket.emit("playground:cancel", { rid: payload.rid });
  };

  const write = (uiSocket: Socket, raw: unknown): void => {
    const payload = sanitizeWrite(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry || entry.uiSocketId !== uiSocket.id) return;
    if (entry.transport !== "ws") return;
    const runtimeEntry = getRuntimeEntry(entry.runtimeId);
    runtimeEntry?.socket.emit("playground:write", { rid: payload.rid, data: payload.data });
  };

  const forwardChunk = (raw: unknown, runtimeId: string | undefined): void => {
    const payload = sanitizeChunk(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry || entry.runtimeId !== runtimeId) return;
    deps.uiNamespace.to(entry.uiSocketId).emit("playground:chunk", payload);
  };

  const forwardEnd = (raw: unknown, runtimeId: string | undefined): void => {
    const payload = sanitizeEnd(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry || entry.runtimeId !== runtimeId) return;
    deps.uiNamespace.to(entry.uiSocketId).emit("playground:end", payload);
    if (entry.timeout) clearTimeout(entry.timeout);
    inFlight.delete(payload.rid);
  };

  const forwardError = (raw: unknown, runtimeId: string | undefined): void => {
    const payload = sanitizeError(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry || entry.runtimeId !== runtimeId) return;
    deps.uiNamespace.to(entry.uiSocketId).emit("playground:error", payload);
    if (entry.timeout) clearTimeout(entry.timeout);
    inFlight.delete(payload.rid);
  };

  const onRuntimeDisconnect = (runtimeId: string): void => {
    for (const [rid, entry] of inFlight) {
      if (entry.runtimeId !== runtimeId) continue;
      try {
        emitErrorToUi(entry.uiSocketId, rid, "Runtime disconnected mid-request");
      } catch (err) {
        log.warn(`Failed to synthesize disconnect error for rid ${rid}`, err);
      }
      if (entry.timeout) clearTimeout(entry.timeout);
      inFlight.delete(rid);
    }
  };

  const onUiDisconnect = (uiSocketId: string): void => {
    for (const [rid, entry] of inFlight) {
      if (entry.uiSocketId !== uiSocketId) continue;
      try {
        const runtimeEntry = getRuntimeEntry(entry.runtimeId);
        runtimeEntry?.socket.emit("playground:cancel", { rid });
      } catch (err) {
        log.warn(`Failed to cancel rid ${rid} on UI disconnect`, err);
      }
      if (entry.timeout) clearTimeout(entry.timeout);
      inFlight.delete(rid);
    }
  };

  const dispose = (): void => {
    for (const entry of inFlight.values()) {
      if (entry.timeout) clearTimeout(entry.timeout);
    }
    inFlight.clear();
  };

  return {
    dispatch,
    cancel,
    write,
    forwardChunk,
    forwardEnd,
    forwardError,
    onRuntimeDisconnect,
    onUiDisconnect,
    dispose,
    _inFlightSize: () => inFlight.size,
  };
}
