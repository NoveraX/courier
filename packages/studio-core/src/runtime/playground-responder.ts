/**
 * Runtime-side handler for the rid-keyed playground wire.
 *
 * Studio routes UI playground requests through `bindingTable.resolveBinding()`
 * to the runtime that owns the requested `(source, transport)` pair, then
 * emits one of three events to that runtime's `/runtime` socket:
 *
 *  - `playground:execute { rid, source, group, method, transport, ... }`
 *    starts a new request. The responder dispatches to the canonical local
 *    executor (`executeRequest` for HTTP, `executeDirectSSE` for SSE,
 *    `executeDirectWSChannel` for WS) and streams results back through
 *    `playground:chunk` / `playground:end` / `playground:error`, all keyed
 *    by the same `rid`.
 *
 *  - `playground:cancel { rid }` aborts an in-flight request. The responder
 *    looks up the AbortController stored under that rid and aborts.
 *
 *  - `playground:write { rid, data }` writes a message into a live WS channel
 *    opened by an earlier `playground:execute { transport: "ws" }`. Looks up
 *    the channel under the same rid and calls `channel.send(data)`.
 *
 * The responder is registry-agnostic: callers pass a `getSources()`
 * accessor so the same responder works regardless of which source
 * registry the runtime populates (the announce-driven
 * `runtime-source-registry` for `attachRuntime`-attached adapters,
 * or the core global registry for the in-process auto-registration
 * path populated by `attachRuntime()` from `courier.config.ts`).
 */

import { executeRequest } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import {
  executeDirectSSE,
  executeDirectWSChannel,
  type InProcessWSChannel,
} from "@noverax/courier/internal-streams";
import { dispatchHttp, dispatchSSE, dispatchWS } from "./responder-dispatch";

/** Minimal Socket.IO socket surface the responder needs. */
export interface ResponderSocket {
  on(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
}

export interface PlaygroundExecutePayload {
  rid: string;
  source: string;
  group: string;
  method: string;
  transport: "http" | "sse" | "ws";
  variables?: unknown;
  headers?: Record<string, string>;
}

export interface PlaygroundCancelPayload {
  rid: string;
}

export interface PlaygroundWritePayload {
  rid: string;
  data: unknown;
}

interface InFlightEntry {
  ac: AbortController;
  channel?: InProcessWSChannel;
}

/**
 * Wire `playground:execute`, `playground:cancel`, and `playground:write`
 * listeners onto a runtime socket. Returns a disposer that aborts every
 * in-flight request and clears the registry — used when the socket is torn
 * down (process shutdown, reconnect cycle).
 *
 * `getSources` is the accessor the responder calls per `playground:execute`
 * to look up the source object. The accessor is invoked lazily so the
 * responder always sees the latest source registration even when adapters
 * announce sources after the responder is wired up.
 */
export function setupPlaygroundResponder(
  socket: ResponderSocket,
  getSources: () => Sources,
): () => void {
  const inFlight = new Map<string, InFlightEntry>();

  const onExecute = (raw: unknown): void => {
    const payload = sanitizeExecute(raw);
    if (!payload) return;
    void runExecute(socket, payload, inFlight, getSources);
  };

  const onCancel = (raw: unknown): void => {
    const payload = sanitizeRid(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry) return;
    entry.ac.abort();
    inFlight.delete(payload.rid);
  };

  const onWrite = (raw: unknown): void => {
    const payload = sanitizeWrite(raw);
    if (!payload) return;
    const entry = inFlight.get(payload.rid);
    if (!entry?.channel) return;
    entry.channel.send(payload.data).catch((err: unknown) => {
      socket.emit("playground:error", {
        rid: payload.rid,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    });
  };

  socket.on("playground:execute", onExecute);
  socket.on("playground:cancel", onCancel);
  socket.on("playground:write", onWrite);

  return () => {
    for (const entry of inFlight.values()) entry.ac.abort();
    inFlight.clear();
  };
}

async function runExecute(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  inFlight: Map<string, InFlightEntry>,
  getSources: () => Sources,
): Promise<void> {
  const ac = new AbortController();
  const entry: InFlightEntry = { ac };
  inFlight.set(payload.rid, entry);

  const sources = getSources();
  const source = sources[payload.source];
  if (!source) {
    emitError(socket, payload.rid, `Source "${payload.source}" not registered in this runtime`);
    inFlight.delete(payload.rid);
    return;
  }

  try {
    if (payload.transport === "http") {
      await dispatchHttp(socket, payload, sources, executeRequest);
    } else if (payload.transport === "sse") {
      await dispatchSSE(socket, payload, sources, ac.signal, executeDirectSSE);
    } else {
      await dispatchWS(socket, payload, sources, ac.signal, executeDirectWSChannel, (channel) => {
        entry.channel = channel;
      });
    }
  } catch (err) {
    emitError(socket, payload.rid, err instanceof Error ? err.message : String(err));
  } finally {
    inFlight.delete(payload.rid);
  }
}

function emitError(socket: ResponderSocket, rid: string, message: string): void {
  socket.emit("playground:error", { rid, error: { message } });
}

function sanitizeExecute(raw: unknown): PlaygroundExecutePayload | null {
  if (!isPlainObject(raw)) return null;
  const r = raw;
  if (typeof r.rid !== "string" || r.rid.length === 0) return null;
  if (typeof r.source !== "string" || typeof r.group !== "string" || typeof r.method !== "string") {
    return null;
  }
  if (r.transport !== "http" && r.transport !== "sse" && r.transport !== "ws") return null;
  if (hasDangerousKeys(r.variables) || hasDangerousKeys(r.headers)) return null;
  return {
    rid: r.rid,
    source: r.source,
    group: r.group,
    method: r.method,
    transport: r.transport,
    variables: r.variables,
    headers:
      r.headers && typeof r.headers === "object"
        ? (r.headers as Record<string, string>)
        : undefined,
  };
}

function sanitizeRid(raw: unknown): PlaygroundCancelPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  return { rid: raw.rid };
}

function sanitizeWrite(raw: unknown): PlaygroundWritePayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (hasDangerousKeys(raw.data)) return null;
  return { rid: raw.rid, data: raw.data };
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

/** Defensive prototype-pollution guard at the wire boundary. */
function hasDangerousKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (
    Object.hasOwn(value, "__proto__") ||
    Object.hasOwn(value, "constructor") ||
    Object.hasOwn(value, "prototype")
  );
}
