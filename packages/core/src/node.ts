import type { IncomingMessage, ServerResponse } from "node:http";
import { discoverAppOrigin } from "./discover-app-origin";
import { createLogger } from "./logger";
import { addressedTo } from "./node-origin";
import { serverOriginOf } from "./socket-origin";
import { isAbortError } from "./utils/abort";

const log = createLogger("Node");

export type { ServerOrigin } from "./discover-app-origin";
export { toWebRequest } from "./node-request";
export {
  nodeIncomingRequest,
  requestContext,
  withIncomingRequest,
} from "./node-request-context";
export {
  attachWebSocketUpgrade,
  DEFAULT_WS_MAX_MESSAGE_SIZE,
  DEFAULT_WS_PATH,
  type UpgradeServer,
  type WebSocketUpgradeOptions,
  wsFrameLimit,
} from "./node-websocket";
export { serverOriginOf } from "./socket-origin";
export {
  type WebRequestOptions,
  webIncomingRequest,
  withSetCookies,
  withWebRequestContext,
} from "./web-request-context";

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
 * Learn the app's origin from a Node request, unless one is set: the address
 * and port of the socket the server accepted it on — see `serverOriginOf`
 * and `discoverAppOrigin`. Nothing the request sends decides it.
 *
 * @param nodeReq - The incoming request
 * @example
 * ```ts
 * server.on("request", (req) => discoverNodeAppOrigin(req));
 * ```
 */
export function discoverNodeAppOrigin(nodeReq: IncomingMessage): void {
  discoverAppOrigin(serverOriginOf(nodeReq.socket));
}

/**
 * Wait until a response the socket could not take at once has been written
 * out, or its client has gone.
 */
function drained(nodeRes: ServerResponse): Promise<void> {
  if (nodeRes.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      nodeRes.off("drain", done);
      nodeRes.off("close", done);
      resolve();
    };
    nodeRes.on("drain", done);
    nodeRes.on("close", done);
  });
}

/**
 * Send a Web Standard Response to a Node.js ServerResponse.
 * Handles streaming bodies and set-cookie headers, and keeps a `Vary` the
 * Node response already carries beside the one the answer brings.
 *
 * The body is read no faster than the client reads it: an SSE stream whose
 * client stopped reading would otherwise be buffered in memory without
 * bound, and its generator would never learn to pause.
 *
 * @param webRes - The response to send
 * @param nodeRes - The Node response to write it to
 * @returns Once the body is written, or the client has gone
 * @example
 * ```ts
 * createServer(async (req, res) => {
 *   await sendWebResponse(await handler(toWebRequest(req, res)), res);
 * });
 * ```
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
  /* writeHead's headers replace the ones set before it, so a `Vary` set
     before it — the `Origin` a CORS grant depends on — is joined with the
     answer's own rather than lost to it. */
  const varied = nodeRes.getHeader("vary");
  const vary = varied === undefined ? "" : joinedVary(varied, webRes.headers.get("vary"));
  if (vary !== "") headersObj.vary = vary;

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
    reader.cancel().catch(noteUnstoppedBody);
  };
  nodeRes.once("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!nodeRes.write(value)) await drained(nodeRes);
    }
  } catch (error) {
    /* The client left, and the proxy stopped the body along with the upstream
       call behind it: there is nobody to deliver to, and nothing failed. */
    if (!nodeRes.destroyed || nodeRes.writableFinished) throw error;
    log.debug("The client left while its response was streaming", error);
  } finally {
    nodeRes.off("close", onClose);
    reader.releaseLock();
    nodeRes.end();
  }
}

/* Two `Vary` values as one that names each field once; `*` stands for all of them. */
function joinedVary(varied: number | string | readonly string[], own: string | null): string {
  const fields = `${varied},${own ?? ""}`
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field !== "");
  if (fields.includes("*")) return "*";
  const named = fields.map((field) => field.toLowerCase());
  return fields.filter((field, at) => named.indexOf(field.toLowerCase()) === at).join(", ");
}

/**
 * Note a response body the client's departure could not cancel.
 *
 * The proxy stops its upstream call when the same client leaves, so the body
 * has usually ended already and refuses the cancel with that abort. Anything
 * else may be a body still running for nobody.
 */
function noteUnstoppedBody(error: unknown): void {
  if (isAbortError(error)) log.debug("The response body had already stopped", error);
  else log.warn("Could not stop the response body", error);
}
