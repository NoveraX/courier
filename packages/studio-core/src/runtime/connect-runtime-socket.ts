/**
 * Open the Studio `/runtime` Socket.IO connection from a runtime process.
 *
 * Owns the runtime side of every Studio↔runtime conversation:
 *
 *  - `runtime:hello` once on connect, identifies the runtime
 *  - `runtime:announce` for every queued + future `announceHosting` entry
 *  - `events` forwarding from the local `EventBus` (request/middleware/
 *    validation/stream/proxy/cache/superseded/upload telemetry) so the Studio
 *    UI can render the timeline + waterfall views, including what was
 *    reported before the socket connected — in batches, one message for
 *    every event a turn of the event loop reports
 *  - `runtime:body` answered with a whole body this runtime keeps
 *  - on a server's runtime, the calls Studio sends only a runtime that
 *    showed it the project's token: the Playground's `playground:execute`
 *    over the rid-keyed wire, `runtime:webhooks` for the webhooks the app
 *    defines, and `webhook:deliver` answered by delivering one, signed
 *    here — see `trusted-calls`, which the browser build never takes
 *
 * Best-effort: if `socket.io-client` fails to load, this warns and returns
 * without throwing — the runtime stays locally attached. Synchronous throws
 * inside `io()` (malformed URL, options parse error) are caught locally so a
 * sidecar failure never propagates up to the user-app's startup path.
 */

import { createLogger } from "@noverax/courier/client";
import type { KeptBodies } from "@noverax/courier/internal-studio";
import type { io as ioFn, Socket } from "socket.io-client";
import type { EventBus } from "../event-bus";
import type { BufferedAnnouncement } from "./announce-hosting";
import { buildAnnouncePayload } from "./announce-payload";
import type { RuntimeKind } from "./attach-runtime-types";
import { answerBodyRequests } from "./body-responder";
import { eventBatches } from "./event-batches";
import { timersCanUnref } from "./runtime-environment";
import { type StudioMessageLimit, studioMessageLimit } from "./studio-message-limit";
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
  bus?: EventBus | undefined;
  /**
   * Where this runtime is served — the page's origin in a browser, the
   * app's on a server — read on each connection, so one learned after the
   * first is sent on the next. Sent on `runtime:hello`: Studio shows it
   * beside the runtime and stamps it onto bound rows for the Playground's
   * "resolved URL" badge.
   */
  listenOrigin?: (() => string | undefined) | undefined;
  /**
   * Reads this project's Studio token, which a server runtime presents on
   * each connection so Studio sends it Playground calls. A browser runtime
   * has none.
   */
  readToken?: (() => string | undefined) | undefined;
  /** The bodies this runtime keeps whole, of the requests whose events carry a part. */
  bodies?: KeptBodies | undefined;
  /**
   * Answers the calls Studio sends only a runtime that showed it the
   * project's token: a server runtime's, which reads the token. A browser
   * runtime has none.
   */
  answerTrusted?: AnswerTrustedCalls | undefined;
}

/** The runtime's socket as the calls only a trusted runtime is sent are answered on. */
export interface TrustedCallsSocket {
  /** The runtime's socket to Studio */
  readonly socket: Socket;
  /** The largest message Studio takes, as it said */
  readonly limit: StudioMessageLimit;
  /** Sends the events reported so far, which an answer follows */
  readonly flushEvents: () => void;
}

/** What answers those calls, as the socket connects and as it goes. */
export interface TrustedCalls {
  /** Tells Studio again what the previous connection told it */
  readonly connected: () => void;
  /** Stops answering */
  readonly stop: () => void;
}

/** Starts answering the calls only a trusted runtime is sent, on the runtime's socket. */
export type AnswerTrustedCalls = (on: TrustedCallsSocket) => TrustedCalls;

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
      /* Asked on every attempt: Studio may write the token after this starts. */
      auth: (send) => send(tokenAuth(input.readToken)),
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
     one. Drained destructively, nothing would be left to restate: the runtime
     would come back, say hello, and sit there bound to nothing. */
  const announced: BufferedAnnouncement[] = [];

  /* Adapters announce as they are constructed, which is whenever the
     application happens to wire its routes — before this socket opens for
     some, after it for others. Drained only on connect, the later ones would
     stay queued for good, and Studio would never learn about those
     transports. */
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
  /* Studio says it in answer to hello. An event is small by design — its
     bodies cut, a stream's messages previewed — but a Playground answer or
     a whole body is as large as the app made it. */
  const limit = studioMessageLimit();
  const batches = eventBatches({
    send: (batch) => socket.emit("events", batch),
    connected: () => socket.connected,
    keep: unsent.keep,
    most: limit.most,
  });
  const trusted = input.answerTrusted?.({ socket, limit, flushEvents: batches.flush });

  socket.on("connect", () => {
    const listenOrigin = input.listenOrigin?.();
    const hello = {
      runtimeId: input.runtimeId,
      kind: input.kind,
      ...(listenOrigin && { listenOrigin }),
    };
    socket.emit("runtime:hello", hello, limit.welcome);
    /* Empty on the first connect, so this replays nothing until there is
       genuinely a previous session's worth of claims to restore. */
    for (const entry of announced) {
      socket.emit("runtime:announce", buildAnnouncePayload(entry));
    }
    drain();
    trusted?.connected();
    for (const event of unsent.take()) batches.add(event);
    batches.flush();
  });

  handle.setAnnouncer(drain);

  // Forward bus events into the socket in `"events"` batches. The Studio
  // `/runtime` namespace handler passes them to the UI and keeps them.
  //
  // An event reported while the socket is not connected — before its first
  // connect, or while Studio restarts — is kept and sent once it connects,
  // rather than handed to Socket.IO, whose own queue would also replay what
  // had already gone out over the previous session.
  let unsubBus: (() => void) | undefined;
  if (input.bus) {
    const bus = input.bus;
    unsubBus = bus.on((event) => {
      if (socket.connected) batches.add(event);
      else unsent.keep(event);
    });
  }

  if (input.bodies) answerBodyRequests(socket, input.bodies, limit);

  handle.setDisposer(() => {
    unsubBus?.();
    trusted?.stop();
    socket.removeAllListeners();
    socket.disconnect();
  });
}

function tokenAuth(readToken: (() => string | undefined) | undefined): { token?: string } {
  const token = readToken?.();
  return token === undefined ? {} : { token };
}
