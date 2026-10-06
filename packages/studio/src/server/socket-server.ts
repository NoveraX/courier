import type { Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "@noverax/courier";
import { type Namespace, type Socket, Server as SocketIOServer } from "socket.io";
import type { CountedSocket, DemoConnections } from "./demo/demo-connections";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { messageOf } from "./message-of";
import type { StudioOriginPolicy } from "./studio-origin";

const log = createLogger("Studio");

/** How Studio's sockets take what is sent to them, and send what they send. */
export interface StudioSocketOptions {
  /** The largest message a socket may send; {@link MAX_MESSAGE_BYTES} unless given. */
  maxMessageBytes?: number | undefined;
  /**
   * Compress what goes over a WebSocket, as a page on the network wants:
   * Studio's events are repetitive JSON, a tenth of their size compressed.
   * Off unless given — a page on this machine gains nothing from it.
   */
  compress?: boolean | undefined;
  /** The sockets a public demo counts, refusing a new one past its visitors' share. */
  connections?: DemoConnections | undefined;
}

/* Compressing a message this small costs more than it saves. */
const COMPRESS_FROM_BYTES = 128;

/** Studio's Socket.IO server and the two namespaces it serves. */
export interface StudioSockets {
  io: SocketIOServer;
  /** The Studio UI. */
  uiNamespace: Namespace;
  /** Application runtimes, in Node and in the browser. */
  runtimeNamespace: Namespace;
}

/**
 * Open Studio's Socket.IO server with the origin policy enforced.
 *
 * Every Engine.IO request admits runtimes, the wider group; the UI namespace
 * then admits only the UI. `cors` alone guarded nothing: it shapes polling
 * responses, and a WebSocket upgrade from any page was accepted. Checking
 * only the handshake was not enough either: a browser sends a same-origin
 * GET without an Origin, so a page on a domain rebound to this machine
 * opened a polling session, and its POSTs and its upgrade, which name the
 * page, were never read.
 *
 * A message may be as large as {@link MAX_MESSAGE_BYTES}, or the limit a
 * public demo sets; a connection that breaks, over a larger one or anything
 * else, is logged with the reason.
 *
 * @param httpServer - The server Studio listens on.
 * @param policy - Who may connect as what.
 * @param options - The largest message a socket may send, and whether WebSockets compress.
 * @returns The Socket.IO server and its namespaces.
 * @example
 * ```ts
 * const { io, uiNamespace, runtimeNamespace } = createStudioSockets(httpServer, policy);
 * ```
 */
export function createStudioSockets(
  httpServer: HttpServer,
  policy: StudioOriginPolicy,
  { maxMessageBytes = MAX_MESSAGE_BYTES, compress = false, connections }: StudioSocketOptions = {},
): StudioSockets {
  const io = new SocketIOServer(httpServer, {
    ...(connections && {
      allowRequest: (req, done) => done(null, connections.admits(req)),
    }),
    cors: {
      origin: (origin, callback) => callback(null, policy.isRuntimeCaller(origin, undefined)),
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: maxMessageBytes,
    perMessageDeflate: compress && { threshold: COMPRESS_FROM_BYTES },
    serveClient: false,
  });
  if (connections) io.engine.on("connection", (socket: CountedSocket) => connections.count(socket));
  /* The handshake, every polling request after it, and the upgrade to a WebSocket. */
  io.engine.use((req: IncomingMessage, _res: ServerResponse, next: (err?: Error) => void) => {
    const { origin, host } = req.headers;
    if (policy.isRuntimeCaller(origin, host)) next();
    else next(new Error(`Studio's sockets do not answer ${origin ?? `a page at ${host}`}`));
  });

  const uiNamespace = io.of("/ui");
  uiNamespace.use((socket, next) => {
    const { origin, host } = socket.handshake.headers;
    if (policy.isUiCaller(origin, host)) next();
    else next(new Error(`The Studio UI namespace does not answer ${origin}`));
  });
  const runtimeNamespace = io.of("/runtime");
  for (const [namespace, who] of [
    [uiNamespace, "The Studio UI"],
    [runtimeNamespace, "A runtime"],
  ] as const) {
    namespace.on("connection", (socket) => reportBrokenConnection(socket, who, maxMessageBytes));
  }

  return { io, uiNamespace, runtimeNamespace };
}

/* A connection closed by a failure, not by either end, loses what was in flight: say so. */
function reportBrokenConnection(socket: Socket, who: string, maxMessageBytes: number): void {
  socket.on("disconnect", (reason, description: unknown) => {
    if (reason !== "transport error" && reason !== "parse error") return;
    const cause = description === undefined ? reason : messageOf(description);
    log.warn(
      `${who} lost its connection to Studio (${cause}). A message is limited to ` +
        `${maxMessageBytes / 1024 / 1024} MB; what was in flight did not arrive.`,
    );
  });
}
