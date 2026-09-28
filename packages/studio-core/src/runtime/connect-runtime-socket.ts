/**
 * Open the Studio `/runtime` Socket.IO connection from a runtime process.
 *
 * Owns the runtime side of every Studio↔runtime conversation:
 *
 *  - `runtime:hello` once on connect, identifies the runtime
 *  - `runtime:announce` for every queued + future `announceHosting` entry
 *  - `event` forwarding from the local `EventBus` (request/middleware/
 *    validation/stream/proxy/cache/dedup/upload telemetry) so the Studio
 *    UI can render the timeline + waterfall views, including what was
 *    reported before the socket connected
 *  - `playground-responder` setup so the Studio playground can dispatch
 *    `playground:execute` to this runtime via the rid-keyed wire
 *
 * Best-effort: if `socket.io-client` fails to load, this warns and returns
 * without throwing — the runtime stays locally attached. Synchronous throws
 * inside `io()` (malformed URL, options parse error) are caught locally so a
 * sidecar failure never propagates up to the user-app's startup path.
 */

import { createLogger, getSources } from "@noverax/courier";
import type { io as ioFn } from "socket.io-client";
import type { EventBus } from "../event-bus";
import type { BufferedAnnouncement } from "./announce-hosting";
import { buildAnnouncePayload } from "./announce-payload";
import type { RuntimeKind } from "./attach-runtime-types";
import { setupPlaygroundResponder } from "./playground-responder";
import { timersCanUnref } from "./runtime-environment";
import { keepUnsentEvents } from "./unsent-events";

const log = createLogger("Studio");

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
  /** Called with a function that flushes queued announcements when connected. */
  setAnnouncer(fn: () => void): void;
}

export async function connectRuntimeSocket(
  input: ConnectInput,
  pending: BufferedAnnouncement[],
  handle: RuntimeSocketHandle,
): Promise<void> {
  let mod: SocketIOClientModule;
  try {
    mod = await import("socket.io-client");
  } catch (err) {
    /* A dependency of this package, so reaching here means the install is
       damaged rather than incomplete. Silence would leave Studio rendering its
       whole UI, watching the config, and never seeing the application, with
       every source sitting at "orphan" and no reason given anywhere. */
    log.warn(
      [
        "Studio cannot connect: socket.io-client failed to load.",
        "It ships as a dependency of @noverax/courier-studio-core, so this",
        "usually means a damaged install. Studio will show your sources as",
        "orphaned until it resolves.",
        "",
        "  npm install",
      ].join("\n"),
      err,
    );
    return;
  }

  let socket: ReturnType<SocketIOClientModule["io"]>;
  try {
    socket = mod.io(`${input.studioUrl}/runtime`, {
      transports: ["websocket"],
      /* A dev-time side channel must never be what keeps a process alive: a
         seed script, a CLI task or a test run that attached hung forever
         when Studio was not running, retrying to connect. Only where timers
         support it, though: socket.io-client calls `.unref()` on its own, and
         in a browser that threw during the handshake and the socket never
         opened. */
      autoUnref: timersCanUnref(),
      reconnection: true,
      reconnectionDelay: 1000,
      /* Studio is restarted constantly in development, and ten attempts a
         second apart gave up long before it came back — every running app was
         then orphaned until it too was restarted. Backing off to five seconds
         and never giving up costs an idle socket a ping now and then. */
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.3,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
    });
  } catch (err) {
    /* A synchronous throw from io() must not take the host application down,
       but it must not vanish either. */
    log.warn(`Studio connection could not be opened at ${input.studioUrl}`, err);
    return;
  }

  /* Every announcement this runtime has ever made, kept rather than consumed.
     Studio drops a runtime's claims when its socket disconnects, so whatever
     was announced over the dead connection has to be stated again over the new
     one. Draining destructively left nothing to restate: the runtime came back,
     said hello, and sat there bound to nothing. */
  const announced: BufferedAnnouncement[] = [];

  /* Adapters announce as they are constructed, which is whenever the
     application happens to wire its routes — before this socket opens for
     some, after it for others. Draining only on connect left the later ones
     queued forever, so Studio never learned about those transports. */
  const drain = (): void => {
    if (!socket.connected) return;
    while (pending.length > 0) {
      const entry = pending.shift();
      if (!entry) continue;
      announced.push(entry);
      socket.emit("runtime:announce", buildAnnouncePayload(entry));
    }
  };

  const unsent = keepUnsentEvents();

  socket.on("connect", () => {
    socket.emit("runtime:hello", {
      runtimeId: input.runtimeId,
      kind: input.kind,
      ...(input.listenOrigin && { listenOrigin: input.listenOrigin }),
    });
    /* Empty on the first connect, so this replays nothing until there is
       genuinely a previous session's worth of claims to restore. */
    for (const entry of announced) {
      socket.emit("runtime:announce", buildAnnouncePayload(entry));
    }
    drain();
    for (const event of unsent.take()) socket.emit("event", event);
  });

  handle.setAnnouncer(drain);

  // Forward bus events into the socket as `"event"` packets. The Studio
  // `/runtime` namespace handler dispatches mock-server lifecycle events
  // into the shared registry and broadcasts everything else to the UI.
  //
  // An event reported while the socket is not connected — before its first
  // connect, or while Studio restarts — is kept and sent once it connects,
  // rather than handed to Socket.IO, whose own queue would also replay what
  // had already gone out over the previous session.
  let unsubBus: (() => void) | undefined;
  if (input.bus) {
    const bus = input.bus;
    unsubBus = bus.on((event) => {
      if (socket.connected) socket.emit("event", event);
      else unsent.keep(event);
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
