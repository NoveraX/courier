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
 *    `executeDirectWSPush` or `executeDirectWSChannel` for a WS push or
 *    channel) and streams results back through
 *    `playground:chunk` / `playground:end` / `playground:error`, all keyed
 *    by the same `rid`.
 *
 *  - `playground:cancel { rid }` aborts an in-flight request. The responder
 *    looks up the AbortController stored under that rid and aborts.
 *
 *  - `playground:write { rid, data }` writes a message into a live WS channel
 *    opened by an earlier `playground:execute { transport: "ws" }`. Looks up
 *    the channel under the same rid and calls `channel.send(data)`; a message
 *    written while the channel is still opening is sent once it has opened.
 *
 * Callers pass a `getSources()` accessor, read on each run: the runtime
 * hands it core's registry, which `attachRuntime()` fills from
 * `courier.config.ts` and the app's own `registerSources` updates.
 */

import type { Sources } from "@noverax/courier/define";
import { executeRequest } from "@noverax/courier/internal";
import {
  executeDirectSSE,
  executeDirectWSChannel,
  executeDirectWSPush,
  wsEndpointKind,
} from "@noverax/courier/internal-streams";
import { dispatchHttp } from "./dispatch-http";
import {
  type PlaygroundExecutePayload,
  sanitizeExecute,
  sanitizeRid,
  sanitizeWrite,
} from "./playground-payloads";
import { openChannelThroughProxy, openStreamThroughProxy } from "./proxy-openers";
import {
  dispatchSSE,
  dispatchWS,
  dispatchWSPush,
  type PlaygroundChannel,
} from "./responder-dispatch";

/** Minimal Socket.IO socket surface the responder needs. */
export interface ResponderSocket {
  on(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
}

interface InFlightEntry {
  ac: AbortController;
  channel?: PlaygroundChannel;
  /* Written before the channel opened, and sent once it has. */
  pending: unknown[];
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
    if (!entry) return;
    if (entry.channel) write(socket, payload.rid, entry.channel, payload.data);
    else entry.pending.push(payload.data);
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
  const entry: InFlightEntry = { ac, pending: [] };
  inFlight.set(payload.rid, entry);

  const sources = getSources();
  const source = sources[payload.source];
  if (!source) {
    emitError(socket, payload.rid, `Source "${payload.source}" not registered in this runtime`);
    inFlight.delete(payload.rid);
    return;
  }

  try {
    const viaProxy = payload.mode === "proxy";
    if (payload.transport === "http") {
      await dispatchHttp(socket, payload, sources, executeRequest);
    } else if (payload.transport === "sse") {
      const open = viaProxy ? openStreamThroughProxy : executeDirectSSE;
      await dispatchSSE(socket, payload, sources, ac.signal, open);
    } else if (wsEndpointKind(sources, payload) === "push") {
      const open = viaProxy ? openStreamThroughProxy : executeDirectWSPush;
      await dispatchWSPush(socket, payload, sources, ac.signal, open);
    } else {
      const open = viaProxy ? openChannelThroughProxy : executeDirectWSChannel;
      await dispatchWS(socket, payload, sources, ac.signal, open, (channel) => {
        entry.channel = channel;
        for (const data of entry.pending.splice(0)) write(socket, payload.rid, channel, data);
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

/* A message the channel refuses is reported on the entry it was written to. */
function write(
  socket: ResponderSocket,
  rid: string,
  channel: PlaygroundChannel,
  data: unknown,
): void {
  /* A channel in this process answers a send with a promise; one reached
     through the proxy sends at once and throws what it refuses. */
  Promise.resolve()
    .then(() => channel.send(data))
    .catch((err: unknown) => {
      emitError(socket, rid, err instanceof Error ? err.message : String(err));
    });
}
