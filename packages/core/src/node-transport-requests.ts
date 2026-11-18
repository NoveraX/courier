import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { HTTPAnswer } from "./adapter/http-transport/http-answers";
import {
  type HTTPExchange,
  httpEntryOf,
  NO_HTTP_TRANSPORT,
} from "./adapter/http-transport/http-entry";
import type { WSHandler } from "./adapter/ws-types";
import { createLogger } from "./logger";
import { nodeHeadersOf } from "./node-headers";
import { addressedURL } from "./node-origin";
import { toWebRequest } from "./node-request";
import { readNodeBodyText } from "./node-request-text";
import { joinedVary } from "./node-response";
import { parseUrl } from "./utils/parse-url";

const log = createLogger("WS");

/* What reads the transport's bodies, as an error names it when something read one first. */
const TRANSPORT = "the HTTP transport";

/* The transport has read the body: the request a connection opens with carries its head alone,
   as an upgrade's does. */
const HEAD_ALONE = () => null;

/** Which of a Node server's requests are the HTTP transport's, and whose transport answers them. */
export interface TransportRequests {
  /** The socket's path; `undefined` for a server that hosts nothing but Courier */
  readonly path: string | undefined;
  /** The WebSocket handler whose HTTP transport answers them */
  readonly handler: WSHandler;
  /** Sees each one taken, before it is answered */
  readonly onRequest?: ((request: IncomingMessage) => void) | undefined;
}

/**
 * Take the WebSocket handler's HTTP transport off a Node server, ahead of
 * every handler the application gives the server, whether it was added
 * before this or after: a `request` the transport takes reaches none of
 * them, so none answers it a second time — a catch-all page with an HTML
 * 200, a 404 — over the transport's own answer. A handler with no HTTP
 * transport answers each 404, as its `handleHTTP` does.
 *
 * A request is the transport's when it is a `POST` to `path`. With no path,
 * on a server that hosts nothing but Courier, it is a `POST` whose body is
 * `text/plain`, as the transport's always is and the proxy's never is.
 *
 * @param server - The HTTP server the application listens with
 * @param taking - Which requests to take, and whose transport answers them
 * @returns What lets go of them: the server's own handlers see them again
 *
 * @example
 * ```ts
 * const release = takeTransportRequests(server, { path: "/api/ws", handler });
 * ```
 */
export function takeTransportRequests(server: Server, taking: TransportRequests): () => void {
  const emit = server.emit;
  const own = Object.hasOwn(server, "emit");
  let taken = true;
  const intercept = function (this: Server, event: string | symbol, ...args: unknown[]): boolean {
    const [req, res] = args as [IncomingMessage, ServerResponse];
    if (taken && event === "request" && isTransportRequest(req, taking.path)) {
      answerTransportRequest(req, res, taking.handler, taking.onRequest);
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
 * server's own request and response, as `takeTransportRequests` answers
 * each it takes: for a framework that routes the request itself, and hands
 * it over before reading its body — Fastify's `onRequest`, its reply
 * hijacked. The handler's gate and transport read it, and the answer is
 * written, with no web `Request`, `Response` or stream made for it but the
 * `Request` a connection it opens is opened with; an answer whole when it
 * is written — a poll's, a refusal — states its length. A target no URL
 * reads, a Host none can name, is the client's mistake and is answered
 * 400; a handler with no HTTP transport answers 404; a failure before the
 * answer's head is answered 500, and logged. Nothing is thrown.
 *
 * @param req - The request, its body unread
 * @param res - Its response, which nothing else writes
 * @param handler - The WebSocket handler whose HTTP transport answers it
 * @param onRequest - Sees it once it reads as a request
 *
 * @example
 * ```ts
 * fastify.post("/api/ws", {
 *   onRequest: async (request, reply) => {
 *     reply.hijack();
 *     answerTransportRequest(request.raw, reply.raw, handler);
 *   },
 *   handler: () => undefined,
 * });
 * ```
 */
export function answerTransportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handler: WSHandler,
  onRequest?: TransportRequests["onRequest"],
): void {
  const url = addressedURL(req);
  if (url === undefined) {
    res.writeHead(400, { "content-length": "0" }).end();
    return;
  }
  onRequest?.(req);
  const entry = httpEntryOf(handler);
  if (entry === undefined) {
    req.resume();
    writeAnswer(res, NO_HTTP_TRANSPORT);
    return;
  }
  entry(nodeExchange(req, url))
    .then((answer) => writeAnswer(res, answer))
    .catch((error: unknown) => {
      log.error("A request of the HTTP transport failed", error);
      if (!res.headersSent) res.writeHead(500, { "content-length": "0" }).end();
    });
}

/* A Node request of the transport, as its entry reads it. */
function nodeExchange(req: IncomingMessage, url: URL): HTTPExchange {
  return {
    method: req.method ?? "GET",
    url,
    headers: nodeHeadersOf(req),
    peerAddress: req.socket.remoteAddress,
    text: (limits) => readNodeBodyText(req, limits, TRANSPORT),
    discard: () => {
      req.resume();
    },
    opening: () => toWebRequest(req, undefined, HEAD_ALONE),
  };
}

/**
 * Write the transport's answer on Node's own response. One whole when it is
 * written goes with its length, in one write; events go as the connection
 * writes them, their head with the first, and a client that leaves before
 * their end is the connection's to hear of.
 */
function writeAnswer(res: ServerResponse, answer: HTTPAnswer): void {
  const { status, body } = answer;
  const headers = withVaried(res, answer.headers);
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  if (typeof body === "string") {
    const length = String(Buffer.byteLength(body));
    res.writeHead(status, { ...headers, "content-length": length }).end(body);
    return;
  }
  /* Its client left while its request was read. */
  if (res.destroyed) {
    body.leave();
    return;
  }
  res.once("close", () => {
    if (!res.writableFinished) body.leave();
  });
  body.attach({
    write(bytes) {
      if (!res.headersSent) res.writeHead(status, headers);
      res.write(bytes);
    },
    end(last) {
      if (!res.headersSent) {
        res.writeHead(status, { ...headers, "content-length": String(last?.byteLength ?? 0) });
      }
      res.end(last);
    },
  });
}

/* The answer's headers, its `Vary` joined with the one the Node response carries already. */
function withVaried(
  res: ServerResponse,
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const varied = res.getHeader("vary");
  if (varied === undefined) return headers;
  return { ...headers, vary: joinedVary(varied, headers.vary) };
}
