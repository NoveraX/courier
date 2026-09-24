import type { Server as HttpServer } from "node:http";
import { type Namespace, Server as SocketIOServer } from "socket.io";
import type { StudioOriginPolicy } from "./studio-origin";

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
 * @param httpServer - The server Studio listens on.
 * @param policy - Who may connect as what.
 * @returns The Socket.IO server and its namespaces.
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
    serveClient: false,
  });

  const uiNamespace = io.of("/ui");
  uiNamespace.use((socket, next) => {
    const { origin, host } = socket.handshake.headers;
    if (policy.isUiCaller(origin, host)) next();
    else next(new Error(`The Studio UI namespace does not answer ${origin}`));
  });

  return { io, uiNamespace, runtimeNamespace: io.of("/runtime") };
}
