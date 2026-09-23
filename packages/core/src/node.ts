import type { IncomingMessage, ServerResponse } from "node:http";

export { toWebRequest } from "./node-request";
export {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  type UpgradeServer,
  type WebSocketUpgradeOptions,
} from "./node-websocket";

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
