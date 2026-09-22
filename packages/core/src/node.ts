import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { ConfigurationError } from "./errors/configuration-error";

/**
 * Extract a canonical `http(s)://host[:port]` origin from a Node.js
 * `IncomingMessage`. Reads the `Host` header (required by HTTP/1.1) and
 * the socket's TLS state for the scheme.
 *
 * Trust boundary: `x-forwarded-proto` / `x-forwarded-host` are **NOT**
 * honored. Reverse-proxy users must set `courier.config.ts.runtime.appOrigin`
 * or the `COURIER_APP_URL` environment variable explicitly, because
 * accepting forwarded headers from an untrusted hop is a
 * trust-on-first-use vulnerability.
 *
 * Returns `undefined` when the request has no `Host` header (malformed
 * HTTP/1.0 clients, crafted payloads) so callers can fall back to env
 * vars or leave `appOrigin` unset rather than store a bogus value.
 */
export function extractOriginFromNodeRequest(nodeReq: IncomingMessage): string | undefined {
  const host = nodeReq.headers.host;
  if (!host || typeof host !== "string") return undefined;
  const encrypted = "encrypted" in nodeReq.socket && nodeReq.socket.encrypted;
  const protocol = encrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Works with Express, Fastify, NestJS, and any Node.js HTTP framework.
 */
export function toWebRequest(nodeReq: IncomingMessage): Request {
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

  return new Request(url, init);
}

/**
 * Send a Web Standard Response to a Node.js ServerResponse.
 * Handles streaming bodies and set-cookie headers.
 */
export async function sendWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  const headersObj: Record<string, string | string[]> = {};
  for (const [key, value] of webRes.headers.entries()) {
    if (key === "set-cookie") {
      headersObj[key] = webRes.headers.getSetCookie();
    } else {
      headersObj[key] = value;
    }
  }

  nodeRes.writeHead(webRes.status, headersObj);

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeRes.write(value);
    }
  } finally {
    reader.releaseLock();
    nodeRes.end();
  }
}
