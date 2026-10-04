import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { LIMITS } from "./adapter/limits";
import { createLogger } from "./logger";
import { toWebRequest } from "./node-request";
import type { WebSocketLike } from "./realtime/adapters";
import { socketError } from "./utils/socket-error";

const log = createLogger("WS");

/** The path a Node adapter answers WebSocket upgrades on unless told otherwise. */
export const DEFAULT_WS_PATH = "/api/ws";

/** The largest WebSocket message, in bytes, a handler accepts unless told otherwise. */
export const DEFAULT_WS_MAX_MESSAGE_SIZE: number = LIMITS.MAX_MESSAGE_SIZE;

/** The frame limit when the message limit is no more than half of it (1 MiB). */
const DEFAULT_WS_FRAME_LIMIT = 1_048_576;

/**
 * The largest WebSocket frame to read at all, for a handler that accepts
 * messages up to `maxMessageSize`; `ws` closes the connection with 1009 on a
 * bigger one, before buffering it.
 *
 * It sits well above the message limit — 1 MiB, or twice `maxMessageSize`
 * when that is larger — so a message over that limit reaches the handler,
 * which refuses the one message with a 4413 error on a connection that stays
 * open, rather than closing the socket and every subscription on it.
 *
 * @param maxMessageSize - The handler's message limit, in bytes (default 64 KB)
 * @returns The frame limit in bytes
 *
 * @example
 * ```ts
 * wsFrameLimit(); // 1_048_576
 * wsFrameLimit(4_194_304); // 8_388_608
 * ```
 */
export function wsFrameLimit(maxMessageSize: number = DEFAULT_WS_MAX_MESSAGE_SIZE): number {
  return Math.max(DEFAULT_WS_FRAME_LIMIT, 2 * maxMessageSize);
}

/** The part of `ws`'s `WebSocketServer` this uses, so core does not depend on `ws`. */
export interface UpgradeServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    done: (socket: WebSocketLike) => void,
  ): void;
  close(): void;
}

export interface WebSocketUpgradeOptions {
  /**
   * The only pathname answered. Upgrades on any other path are left to the
   * application's own handlers — socket.io, GraphQL subscriptions, a dev
   * server's hot reload. `undefined` answers every path, for a server that
   * hosts nothing but Courier.
   */
  path: string | undefined;
  /**
   * Largest frame accepted, in bytes; `ws` refuses a larger one before
   * buffering it, closing the connection with 1009. Default `wsFrameLimit()`.
   */
  maxPayload?: number;
  /** Builds the `ws` server, the first time an upgrade arrives. */
  createServer: (options: {
    noServer: true;
    maxPayload: number;
  }) => UpgradeServer | Promise<UpgradeServer>;
  /** Receives each accepted connection. */
  onSocket: (socket: WebSocketLike, request: Request) => void;
  /** Sees each upgrade request Courier answers, before it is accepted. */
  onRequest?: (request: IncomingMessage) => void;
  /** While this returns false — a server shutting down — upgrades get a 503. */
  isAccepting?: () => boolean;
}

/**
 * Answer WebSocket upgrades on a Node HTTP server.
 *
 * Only upgrades to `path` are taken: an application with a WebSocket of its
 * own would otherwise have two handlers accept the same socket, and `ws`
 * throws out of the process on the first connection.
 *
 * Detaching also closes every connection the handler accepted, with 1012 —
 * "service restart", which a Courier client answers by reconnecting later.
 * `ws` leaves accepted clients open when its server closes, so a host that
 * detached before closing its HTTP server waited on them indefinitely.
 *
 * @param server - The HTTP server the application listens with
 * @param options - Path, frame limit and what to do with a connection
 * @returns A function that detaches the handler, closes the connections it
 *   accepted and closes the `ws` server
 *
 * @example
 * ```ts
 * const detach = attachWebSocketUpgrade(server, {
 *   path: "/api/ws",
 *   createServer: async (o) => new (await import("ws")).WebSocketServer(o),
 *   onSocket: (socket, request) => handler.handleSocket(socket, request),
 * });
 * ```
 */
export function attachWebSocketUpgrade(
  server: Server,
  options: WebSocketUpgradeOptions,
): () => void {
  const maxPayload = options.maxPayload ?? wsFrameLimit();
  const accepted = new Set<WebSocketLike>();
  let wss: Promise<UpgradeServer> | undefined;

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (options.path !== undefined && pathnameOf(req) !== options.path) {
      /* Someone else may answer it; if nobody can, the client is told so
         instead of waiting for a timeout. */
      if (server.listenerCount("upgrade") === 1) refuse(socket, 404, "Not Found");
      return;
    }

    if (options.isAccepting?.() === false) {
      refuse(socket, 503, "Service Unavailable");
      return;
    }

    socket.on("error", onUpgradeError);
    options.onRequest?.(req);
    /* One server for every connection, even when two upgrades arrive before
       the first has finished loading `ws`. */
    wss ??= Promise.resolve().then(() => options.createServer({ noServer: true, maxPayload }));
    void accept(wss, req, socket, head);
  };

  async function accept(
    ready: Promise<UpgradeServer>,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    try {
      const upgradeServer = await ready;
      upgradeServer.handleUpgrade(req, socket, head, (ws) => {
        /* The connection is `ws`'s from here, and so is its socket's error:
           left listening, this reported every client that dropped without
           a close frame as an upgrade that failed. */
        socket.off("error", onUpgradeError);
        /* `ws` reports an oversized or malformed frame as an error event, and
           with no listener that is an uncaught exception. The handler wires
           its own only after an async `onConnect`, so a frame sent before
           that finished could take the process down. */
        ws.addEventListener("error", (event) => log.warn("WebSocket error", socketError(event)));
        accepted.add(ws);
        ws.addEventListener("close", () => accepted.delete(ws));
        options.onSocket(ws, toWebRequest(req));
      });
    } catch (error) {
      /* The socket is answered rather than left open; the process stays up. */
      log.error("WebSocket upgrade failed", error);
      refuse(socket, 500, "Internal Server Error");
    }
  }

  server.on("upgrade", onUpgrade);
  return () => {
    server.off("upgrade", onUpgrade);
    for (const ws of accepted) ws.close(1012, "Server shutting down");
    accepted.clear();
    /* A server that failed to load was reported when the upgrade failed. */
    void wss?.then(
      (ready) => ready.close(),
      () => undefined,
    );
  };
}

function onUpgradeError(error: Error): void {
  log.warn("WS upgrade socket error", error);
}

function pathnameOf(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}

function refuse(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
