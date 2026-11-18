import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createLogger } from "./logger";
import { toWebRequest } from "./node-request";
import { sendWebResponse } from "./node-response";
import { parseUrl } from "./utils/parse-url";

const log = createLogger("WS");

/** Which of a Node server's requests are the HTTP transport's, and what answers them. */
export interface TransportRequests {
  /** The socket's path; `undefined` for a server that hosts nothing but Courier */
  readonly path: string | undefined;
  /** Answers one: the WebSocket handler's `handleHTTP` */
  readonly answer: (request: Request, peerAddress?: string) => Promise<Response>;
  /** Sees each one taken, before it is answered */
  readonly onRequest?: ((request: IncomingMessage) => void) | undefined;
}

/**
 * Take the WebSocket handler's HTTP transport off a Node server, ahead of
 * every handler the application gives the server, whether it was added
 * before this or after: a `request` the transport takes reaches none of
 * them, so none answers it a second time — a catch-all page with an HTML
 * 200, a 404 — over the transport's own answer.
 *
 * A request is the transport's when it is a `POST` to `path`. With no path,
 * on a server that hosts nothing but Courier, it is a `POST` whose body is
 * `text/plain`, as the transport's always is and the proxy's never is.
 *
 * @param server - The HTTP server the application listens with
 * @param taking - Which requests to take, and what answers them
 * @returns What lets go of them: the server's own handlers see them again
 *
 * @example
 * ```ts
 * const release = takeTransportRequests(server, {
 *   path: "/api/ws",
 *   answer: (request, peer) => handler.handleHTTP(request, peer),
 * });
 * ```
 */
export function takeTransportRequests(server: Server, taking: TransportRequests): () => void {
  const emit = server.emit;
  const own = Object.hasOwn(server, "emit");
  let taken = true;
  const intercept = function (this: Server, event: string | symbol, ...args: unknown[]): boolean {
    const [req, res] = args as [IncomingMessage, ServerResponse];
    if (taken && event === "request" && isTransportRequest(req, taking.path)) {
      answerTransportRequest(req, res, taking.answer, taking.onRequest);
      return true;
    }
    return Reflect.apply(emit, this, [event, ...args]) as boolean;
  } as Server["emit"];
  server.emit = intercept;
  return () => {
    taken = false;
    /* Another took the server's emit after this one, and passes through it: it stays, letting
       every request by. */
    if (server.emit !== intercept) return;
    if (own) server.emit = emit;
    else Reflect.deleteProperty(server, "emit");
  };
}

function isTransportRequest(req: IncomingMessage, path: string | undefined): boolean {
  if (req.method !== "POST") return false;
  if (path !== undefined) return parseUrl(req.url ?? "/", "http://localhost")?.pathname === path;
  const type = req.headers["content-type"] ?? "";
  return type.split(";")[0]?.trim().toLowerCase() === "text/plain";
}

/**
 * Answer one request of the WebSocket handler's HTTP transport on a Node
 * server's request and response, as `takeTransportRequests` answers each it
 * takes: for a framework that routes the request itself, and hands it over
 * before reading its body — Fastify's `onRequest`, its reply hijacked. A
 * target no URL reads, a Host none can name, is the client's mistake and is
 * answered 400; a failure before the answer's head is answered 500, and
 * logged. Nothing is thrown.
 *
 * @param req - The request, its body unread
 * @param res - Its response, which nothing else writes
 * @param answer - What answers it: the WebSocket handler's `handleHTTP`
 * @param onRequest - Sees it once it reads as a request
 *
 * @example
 * ```ts
 * fastify.post("/api/ws", {
 *   onRequest: async (request, reply) => {
 *     reply.hijack();
 *     answerTransportRequest(request.raw, reply.raw, (req, peer) => handler.handleHTTP(req, peer));
 *   },
 *   handler: () => undefined,
 * });
 * ```
 */
export function answerTransportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  answer: TransportRequests["answer"],
  onRequest?: TransportRequests["onRequest"],
): void {
  let request: Request;
  try {
    request = toWebRequest(req, res);
  } catch {
    res.writeHead(400, { "Content-Length": "0" }).end();
    return;
  }
  onRequest?.(req);
  answer(request, req.socket.remoteAddress)
    .then((response) => sendWebResponse(response, res))
    .catch((error: unknown) => {
      log.error("A request of the HTTP transport failed", error);
      if (!res.headersSent) res.writeHead(500, { "Content-Length": "0" }).end();
    });
}
