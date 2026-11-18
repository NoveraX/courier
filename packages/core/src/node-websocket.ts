import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { closeWithNotice } from "./adapter/ws-close";
import { wsFrameLimit } from "./adapter/ws-frame-limit";
import { shutdownClose } from "./adapter/ws-shutdown";
import { createLogger } from "./logger";
import { toWebRequest } from "./node-request";
import { takeTransportRequests } from "./node-transport-requests";
import type { WebSocketLike } from "./realtime/adapters";
import { parseUrl } from "./utils/parse-url";
import { socketError } from "./utils/socket-error";

const log = createLogger("WS");

/** The path a Node adapter answers WebSocket upgrades on unless told otherwise. */
export const DEFAULT_WS_PATH = "/api/ws";

/** A connection `ws` accepted: what the handler uses, and a way to end it without the closing handshake. */
interface UpgradedSocket extends WebSocketLike {
  terminate(): void;
}

/** The part of `ws`'s `WebSocketServer` this uses, so core does not depend on `ws`. */
export interface UpgradeServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    done: (socket: UpgradedSocket) => void,
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
  maxPayload?: number | undefined;
  /** Builds the `ws` server, the first time an upgrade arrives. */
  createServer: (options: {
    noServer: true;
    maxPayload: number;
  }) => UpgradeServer | Promise<UpgradeServer>;
  /**
   * Receives each accepted connection, and may give back what closes it as
   * its handler's stop does, for a detach before the handler stopped — as
   * `handleSocket` of Courier's handler does.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: an onSocket with no return statement returns `void`, which `undefined` does not take
  onSocket: (socket: WebSocketLike, request: Request) => (() => void) | void;
  /** Sees each request Courier answers: an upgrade before it is accepted, and each of `onHTTP`'s. */
  onRequest?: ((request: IncomingMessage) => void) | undefined;
  /** While this returns false — a server shutting down — upgrades get a 503. */
  isAccepting?: (() => boolean) | undefined;
  /**
   * Answers the handler's HTTP transport — `handleHTTP` of Courier's
   * handler: a client whose network lets no socket through keeps the same
   * connection over `POST` requests to `path`, taken ahead of every other
   * handler of the server, whichever was added first. Without a `path`,
   * every `POST` whose body is `text/plain` is taken, as the transport's
   * always is and the proxy's never is. They are answered while the server
   * stops too, so a connection it closes hears why.
   */
  onHTTP?: ((request: Request, peerAddress?: string) => Promise<Response>) | undefined;
}

/**
 * Answer WebSocket upgrades on a Node HTTP server, and with `onHTTP` the
 * requests of the handler's HTTP transport, ahead of the server's own
 * handlers.
 *
 * Only upgrades to `path` are taken: an application with a WebSocket of its
 * own would otherwise have two handlers accept the same socket, and `ws`
 * throws out of the process on the first connection.
 *
 * Detaching also closes every connection still open, its client told why
 * and when to come back before the close, as the protocol has every close
 * of the server's. One a Courier handler holds is closed as the handler's
 * own stop closes it — `disconnect` with 1001, or `auth_error` before it
 * was let in. One no handler holds was let in by none, so it is answered
 * `auth_error` with 1001. `ws` leaves accepted clients open when its server
 * closes, so a host that detached before closing its HTTP server waited on
 * them indefinitely. A connection closing already — closed by the
 * handler's drain, which told its client why — is sent nothing more; one
 * whose peer never answered that close is ended at once: `ws` would hold it
 * 30 seconds more, and the HTTP server's close with it.
 *
 * @param server - The HTTP server the application listens with
 * @param options - Path, frame limit and what to do with a connection
 * @returns A function that detaches the handler — the server's own
 *   handlers see the transport's requests again — closes the connections
 *   it accepted, ends those that did not answer their close, and closes the
 *   `ws` server
 *
 * @example
 * ```ts
 * const detach = attachWebSocketUpgrade(server, {
 *   path: "/api/ws",
 *   createServer: async (o) => new (await import("ws")).WebSocketServer(o),
 *   onSocket: (socket, request) => handler.handleSocket(socket, request),
 *   onHTTP: (request, peer) => handler.handleHTTP(request, peer),
 * });
 * ```
 */
export function attachWebSocketUpgrade(
  server: Server,
  options: WebSocketUpgradeOptions,
): () => void {
  const maxPayload = options.maxPayload ?? wsFrameLimit();
  /* Each connection open, with what closes it as its handler's stop does, where one holds it. */
  const accepted = new Map<UpgradedSocket, (() => void) | undefined>();
  let wss: Promise<UpgradeServer> | undefined;

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    /* A target no URL reads, a Host none can name, is the client's mistake:
       answered, never thrown in here, where it would end the process. */
    const pathname = pathnameOf(req);
    if (options.path !== undefined && pathname !== options.path) {
      /* Someone else may answer it; if nobody can, the client is told so
         instead of waiting for a timeout. */
      if (server.listenerCount("upgrade") === 1) {
        if (pathname === undefined) refuse(socket, 400, "Bad Request");
        else refuse(socket, 404, "Not Found");
      }
      return;
    }
    const request = webRequestOf(req);
    if (request === undefined) {
      refuse(socket, 400, "Bad Request");
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
    void accept(wss, req, request, socket, head);
  };

  async function accept(
    ready: Promise<UpgradeServer>,
    req: IncomingMessage,
    request: Request,
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
        accepted.set(ws, undefined);
        ws.addEventListener("close", () => accepted.delete(ws));
        const close = options.onSocket(ws, request);
        if (close) accepted.set(ws, close);
      });
    } catch (error) {
      /* The socket is answered rather than left open; the process stays up. */
      log.error("WebSocket upgrade failed", error);
      refuse(socket, 500, "Internal Server Error");
    }
  }

  server.on("upgrade", onUpgrade);
  const release =
    options.onHTTP &&
    takeTransportRequests(server, {
      path: options.path,
      answer: options.onHTTP,
      onRequest: options.onRequest,
    });
  return () => {
    release?.();
    server.off("upgrade", onUpgrade);
    for (const [ws, close] of accepted) {
      if (ws.readyState !== 1) ws.terminate();
      else if (close) close();
      else closeWithNotice(ws, shutdownClose(), false);
    }
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

function pathnameOf(req: IncomingMessage): string | undefined {
  return parseUrl(req.url ?? "/", "http://localhost")?.pathname;
}

function webRequestOf(req: IncomingMessage): Request | undefined {
  try {
    return toWebRequest(req);
  } catch {
    return undefined;
  }
}

function refuse(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
