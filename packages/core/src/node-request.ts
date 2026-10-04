import type { IncomingMessage, ServerResponse } from "node:http";
import { rememberPeerAddress } from "./adapter/peer-address";
import { ConfigurationError } from "./errors/configuration-error";
import type { WebBody } from "./http-client/web-types";
import { addressedTo } from "./node-origin";
import { nodeRequestBody } from "./node-request-body";

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Works with Express, Fastify, NestJS, and any Node.js HTTP framework.
 *
 * The URL is the one the client used, taken from a local proxy's
 * `X-Forwarded-Proto` / `X-Forwarded-Host` when there is one — see
 * {@link addressedTo}.
 *
 * Pass the response too wherever there is one: the request's `signal` then
 * fires when the client goes away before the response is done. Without it,
 * an SSE stream on a Node adapter never learned that its client had left,
 * and kept its generator, its upstream subscription and its connection slot
 * until the lifetime cap — 30 minutes by default.
 *
 * Some hosts read every body themselves before a route runs — NestJS's
 * global JSON parser, or Nitro's in-process fetch, which never streams at
 * all. Such an adapter passes `keptBody`, which is asked for what the host
 * kept only once the stream turns out to be spent. A spent stream with
 * nothing kept is still refused, with a message that names the cause.
 *
 * @param nodeReq - The incoming request
 * @param nodeRes - Its response, whose early close aborts the request
 * @param keptBody - The body the host already read, when it kept one
 * @returns The equivalent Web Standard Request
 *
 * @example
 * ```ts
 * const request = toWebRequest(req, res, () =>
 *   req.rawBody instanceof Uint8Array ? Uint8Array.from(req.rawBody) : undefined,
 * );
 * ```
 */
export function toWebRequest(
  nodeReq: IncomingMessage,
  nodeRes?: ServerResponse,
  keptBody?: () => WebBody | null | undefined,
): Request {
  const { protocol, host = "localhost" } = addressedTo(nodeReq);
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

  const init: RequestInit & { duplex?: string } = {
    ...(nodeReq.method !== undefined && { method: nodeReq.method }),
    headers,
  };
  if (nodeRes) init.signal = abortedWhenClientLeaves(nodeRes);

  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    /* A body parser mounted across the whole application consumes this stream
       before the proxy route runs. `new Request` then throws undici's "body
       object should not be disturbed or locked", which says nothing about the
       middleware that did it. */
    const spent = nodeReq.readableEnded || nodeReq.readableDidRead;
    const kept = spent ? keptBody?.() : undefined;
    if (spent && kept === undefined) {
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

    if (kept === undefined) {
      init.body = nodeRequestBody(nodeReq);
    } else {
      /* What the host kept can differ in length from what was sent — a parsed
         body serialized again — so the length the client declared no longer
         describes it. */
      headers.delete("content-length");
      init.body = kept;
    }
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
