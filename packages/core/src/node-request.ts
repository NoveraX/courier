import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { rememberPeerAddress } from "./adapter/peer-address";
import { ConfigurationError } from "./errors/configuration-error";

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Works with Express, Fastify, NestJS, and any Node.js HTTP framework.
 *
 * Pass the response too wherever there is one: the request's `signal` then
 * fires when the client goes away before the response is done. Without it,
 * an SSE stream on a Node adapter never learned that its client had left,
 * and kept its generator, its upstream subscription and its connection slot
 * until the lifetime cap — 30 minutes by default.
 *
 * @param nodeReq - The incoming request
 * @param nodeRes - Its response, whose early close aborts the request
 * @returns The equivalent Web Standard Request
 */
export function toWebRequest(nodeReq: IncomingMessage, nodeRes?: ServerResponse): Request {
  const encrypted = "encrypted" in nodeReq.socket && nodeReq.socket.encrypted;
  const protocol = encrypted ? "https" : "http";
  const host = nodeReq.headers.host ?? "localhost";
  const url = new URL(nodeReq.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeReq.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex?: string } = { method: nodeReq.method, headers };
  if (nodeRes) init.signal = abortedWhenClientLeaves(nodeRes);

  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    /* A body parser mounted across the whole application consumes this stream
       before the proxy route runs. `new Request` then throws undici's "body
       object should not be disturbed or locked", which says nothing about the
       middleware that did it. */
    if (nodeReq.readableEnded || nodeReq.readableDidRead) {
      throw new ConfigurationError(
        "REQUEST_BODY_ALREADY_READ",
        [
          "[courier] The request body was already read before the proxy route.",
          "",
          "A body parser is mounted across the whole application — `express.json()`,",
          "`express.urlencoded()`, `multer`, or a framework equivalent. The proxy",
          "reads the raw body itself, so it must not be parsed first.",
          "",
          "Mount the parser on the routes that need it rather than globally:",
          "  app.use('/api/users', express.json())",
        ].join("\n"),
      );
    }

    init.body = Readable.toWeb(nodeReq) as ReadableStream;
    init.duplex = "half";
  }

  const request = new Request(url, init);
  rememberPeerAddress(request, nodeReq.socket.remoteAddress);
  return request;
}

/**
 * A signal that fires when the client goes away before the response is done.
 *
 * The response's `close` is the dependable event: a request's own `close`
 * fires as soon as its body has been read, long before a stream ends.
 */
function abortedWhenClientLeaves(nodeRes: ServerResponse): AbortSignal {
  const controller = new AbortController();
  nodeRes.once("close", () => {
    if (!nodeRes.writableFinished) controller.abort();
  });
  return controller.signal;
}
