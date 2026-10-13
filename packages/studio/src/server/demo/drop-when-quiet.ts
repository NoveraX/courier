import type { IncomingMessage, ServerResponse } from "node:http";

import { requestWork } from "../request-work";

/**
 * Drop a visitor's connection that makes no progress for `idleMs` on the
 * visitor's turn: while its request's body is on its way, and once the
 * route has written its answer for the visitor to read — compressed or not,
 * read or not. While Studio works on the request the connection may stay
 * quiet, for as long as the work's own budget lets it run; once the answer
 * has been sent, the server's keep-alive timeout takes over.
 *
 * Node's HTTP server destroys a socket that times out when nothing else
 * handles the timeout, and the socket's close ends the request's work and
 * frees what it held. Not for the server as a whole: a page's Socket.IO
 * long-poll stays quiet for longer by design.
 *
 * @param req - The visitor's request, its body not yet read
 * @param res - Its response
 * @param idleMs - How long the connection may make no progress on the visitor's turn
 * @example
 * ```ts
 * dropWhenQuiet(req, res, 10_000);
 * next();
 * ```
 */
export function dropWhenQuiet(req: IncomingMessage, res: ServerResponse, idleMs: number): void {
  const { socket } = req;
  /* Once the answer has been sent, the server's keep-alive timeout is in force. */
  void requestWork(res).written.then(() => {
    if (!res.writableFinished) socket.setTimeout(idleMs);
  });
  if (!hasBody(req)) return;
  socket.setTimeout(idleMs);
  /* A body read after the answer is the server draining it, and the keep-alive
     timeout it set then is not this one to clear. */
  req.once("end", () => {
    if (!res.writableEnded) socket.setTimeout(0);
  });
}

/* A request says it sends a body by its length or by being chunked. */
function hasBody(req: IncomingMessage): boolean {
  const length = Number(req.headers["content-length"] ?? 0);
  return req.headers["transfer-encoding"] !== undefined || length > 0;
}
