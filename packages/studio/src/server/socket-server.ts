import type { Server as HttpServer } from "node:http";
import { createLogger } from "@noverax/courier";
import { type Namespace, type Socket, Server as SocketIOServer } from "socket.io";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import { messageOf } from "./message-of";
import type { StudioOriginPolicy } from "./studio-origin";

const log = createLogger("Studio");

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
 * The handshake admits runtimes, the wider group; the UI namespace then
 * admits only the UI. `cors` alone guarded nothing: it shapes polling
 * responses, and a WebSocket upgrade from any page was accepted.
 *
 * A message may be as large as {@link MAX_MESSAGE_BYTES}; a connection that
 * breaks, over a larger one or anything else, is logged with the reason.
 *
 * @param httpServer - The server Studio listens on.
 * @param policy - Who may connect as what.
 * @returns The Socket.IO server and its namespaces.
 * @example
 * ```ts
 * const { io, uiNamespace, runtimeNamespace } = createStudioSockets(httpServer, policy);
 * ```
 */
export function createStudioSockets(
  httpServer: HttpServer,
  policy: StudioOriginPolicy,
): StudioSockets {
  const io = new SocketIOServer(httpServer, {
    allowRequest: (req, callback) => {
      callback(null, policy.isRuntimeCaller(req.headers.origin, req.headers.host));
    },
    cors: {
      origin: (origin, callback) => callback(null, policy.isRuntimeCaller(origin, undefined)),
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
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
    namespace.on("connection", (socket) => reportBrokenConnection(socket, who));
  }

  return { io, uiNamespace, runtimeNamespace };
}

/* A connection closed by a failure, not by either end, loses what was in flight: say so. */
function reportBrokenConnection(socket: Socket, who: string): void {
  socket.on("disconnect", (reason, description: unknown) => {
    if (reason !== "transport error" && reason !== "parse error") return;
    const cause = description === undefined ? reason : messageOf(description);
    log.warn(
      `${who} lost its connection to Studio (${cause}). A message is limited to ` +
        `${MAX_MESSAGE_BYTES / 1024 / 1024} MB; what was in flight did not arrive.`,
    );
  });
}
