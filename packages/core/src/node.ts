import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "./logger";
import { addressedTo } from "./node-origin";

const log = createLogger("Node");

export { toWebRequest } from "./node-request";
export {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  type UpgradeServer,
  type WebSocketUpgradeOptions,
} from "./node-websocket";

/**
 * Extract a canonical `http(s)://host[:port]` origin from a Node.js
 * `IncomingMessage`: the one its client addressed. A local or private-network
 * proxy's `X-Forwarded-Proto` / `X-Forwarded-Host` are honored, as the
 * request URL honors them; from any other peer they are ignored, so a
 * public caller cannot claim another site's name.
 *
 * Returns `undefined` when the request has no host at all (malformed
 * HTTP/1.0 clients, crafted payloads) so callers can fall back to env
 * vars or leave `appOrigin` unset rather than store a bogus value.
 */
export function extractOriginFromNodeRequest(nodeReq: IncomingMessage): string | undefined {
  const { protocol, host } = addressedTo(nodeReq);
  if (!host) return undefined;
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
  /* A client that leaves mid-stream stops the body too — a streamed upstream
     response is then no longer downloaded for nobody. The listener goes once
     the body is written: a later close would cancel a reader already let go. */
  const onClose = () => {
    if (nodeRes.writableFinished) return;
    reader.cancel().catch((error: unknown) => log.warn("Could not stop the response body", error));
  };
  nodeRes.once("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeRes.write(value);
    }
  } finally {
    nodeRes.off("close", onClose);
    reader.releaseLock();
    nodeRes.end();
  }
}
