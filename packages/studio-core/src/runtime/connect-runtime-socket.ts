/**
 * Open the Studio `/runtime` Socket.IO connection from a runtime process.
 *
 * Owns the runtime side of every Studio↔runtime conversation:
 *
 *  - `runtime:hello` once on connect, identifies the runtime
 *  - `runtime:announce` for every queued + future `announceHosting` entry
 *  - `event` forwarding from the local `EventBus` (request/middleware/
 *    validation/stream/proxy/cache/dedup/upload telemetry) so the Studio
 *    UI can render the timeline + waterfall views
 *  - `playground-responder` setup so the Studio playground can dispatch
 *    `playground:execute` to this runtime via the rid-keyed wire
 *
 * Best-effort: if `socket.io-client` is not installed (it's an optional
 * peer dependency), this returns without throwing — the runtime stays
 * locally attached and a later install pulls it in via `attachRuntime`'s
 * idempotent re-entry. Synchronous throws inside `io()` (malformed URL,
 * options parse error) are caught locally so a sidecar failure never
 * propagates up to the user-app's startup path.
 */

import { getSources } from "@noverax/nexus";
import { getSourceName } from "@noverax/nexus/define";
import type { io as ioFn } from "socket.io-client";
import type { EventBus } from "../event-bus";
import type { BufferedAnnouncement } from "./announce-hosting";
import type { RuntimeKind } from "./attach-runtime-types";
import { setupPlaygroundResponder } from "./playground-responder";

type SocketIOClientModule = { io: typeof ioFn };

interface ConnectInput {
  runtimeId: string;
  kind: RuntimeKind;
  studioUrl: string;
  /**
   * Optional EventBus. When provided, every event emitted on the bus is
   * forwarded over the same socket as a `"event"` packet so Studio's
   * `/runtime` namespace handler can broadcast it to the UI namespace.
   * Server-side runtimes always pass a bus; the browser path opens the
   * socket without one.
   */
  bus?: EventBus;
  /**
   * Canonical HTTP(S) origin this runtime listens on, when known.
   * Sent on `runtime:hello` so Studio can stamp it onto bound rows in the
   * binding-table snapshot for the playground "resolved URL" badge.
   */
  listenOrigin?: string;
}

/** Hook that lets `attachRuntime` install the real socket disposer once ready. */
export interface RuntimeSocketHandle {
  setDisposer(fn: () => void): void;
}

interface AnnouncePayload {
  transports: ReadonlyArray<string>;
  sources: string[];
  listenOrigin?: string;
  framework?: string;
}

function buildAnnouncePayload(entry: BufferedAnnouncement): AnnouncePayload {
  const sources: string[] = [];
  for (const source of entry.sources) {
    const name = getSourceName(source);
    if (name && !sources.includes(name)) sources.push(name);
  }
  const payload: AnnouncePayload = { transports: entry.transports, sources };
  if (entry.listenOrigin !== undefined) payload.listenOrigin = entry.listenOrigin;
  if (entry.framework !== undefined) payload.framework = entry.framework;
  return payload;
}

export async function connectRuntimeSocket(
  input: ConnectInput,
  pending: BufferedAnnouncement[],
  handle: RuntimeSocketHandle,
): Promise<void> {
  let mod: SocketIOClientModule;
  try {
    mod = await import("socket.io-client");
  } catch {
    // socket.io-client not installed — best-effort, stay locally attached.
    return;
  }

  let socket: ReturnType<SocketIOClientModule["io"]>;
  try {
    socket = mod.io(`${input.studioUrl}/runtime`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  } catch {
    // Synchronous io() throw — local catch so the user-app's startup path
    // is unaffected. The runtime stays attached locally without a socket.
    return;
  }

  socket.on("connect", () => {
    socket.emit("runtime:hello", {
      runtimeId: input.runtimeId,
      kind: input.kind,
      ...(input.listenOrigin && { listenOrigin: input.listenOrigin }),
    });
    while (pending.length > 0) {
      const entry = pending.shift();
      if (!entry) continue;
      socket.emit("runtime:announce", buildAnnouncePayload(entry));
    }
  });

  // Forward bus events into the socket as `"event"` packets. The Studio
  // `/runtime` namespace handler dispatches mock-server lifecycle events
  // into the shared registry and broadcasts everything else to the UI.
  //
  // Events emitted while the socket is mid-disconnect are dropped on the
  // sender side via the `connected` guard — Socket.IO's internal queue
  // would otherwise replay them on reconnect, producing duplicate UI
  // entries for events that already shipped over the previous session.
  let unsubBus: (() => void) | undefined;
  if (input.bus) {
    const bus = input.bus;
    unsubBus = bus.on((event) => {
      if (!socket.connected) return;
      socket.emit("event", event);
    });
  }

  // Wire the rid-keyed playground responder onto this socket so Studio
  // can dispatch `playground:execute` here. The responder reads the live
  // sources registry on every dispatch.
  const disposeResponder = setupPlaygroundResponder(socket, () => getSources() ?? {});

  handle.setDisposer(() => {
    unsubBus?.();
    disposeResponder();
    socket.removeAllListeners();
    socket.disconnect();
  });
}
