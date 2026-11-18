import type { IncomingMessage } from "node:http";

import { isLocalAddress } from "./utils/local-address";
import { parseUrl } from "./utils/parse-url";

/**
 * The scheme and host a Node request was addressed to, as its client saw them.
 *
 * Behind a proxy that terminates TLS — nginx, a cloud load balancer, a CDN —
 * the socket is plain HTTP and `Host` may name the upstream, so a request
 * the browser sent to `https://app.example.com` would look addressed to
 * `http://…`, its `Origin` would never match, and every POST and WebSocket
 * from the app's own pages would be refused with 403. The proxy's
 * `X-Forwarded-Proto` and `X-Forwarded-Host` say what the client used, but
 * only when the socket's peer is local or on a private network — the rule
 * the per-address WebSocket limit applies to `X-Forwarded-For` — so a caller
 * on a public address cannot claim another site's name. A browser on this
 * machine or its network sends them too, from a page on a rebound name; the
 * request keeps the `Host` it came with, which the proxy's host rule weighs
 * as well.
 *
 * @param nodeReq - The incoming request
 * @returns The scheme (without `:`) and host, or no host when none was sent
 */
export function addressedTo(nodeReq: IncomingMessage): {
  protocol: "http" | "https";
  host: string | undefined;
} {
  const encrypted = "encrypted" in nodeReq.socket && nodeReq.socket.encrypted === true;
  /* A malformed request can carry `Host` more than once; it names no host. */
  const sent: unknown = nodeReq.headers.host;
  const direct = {
    protocol: encrypted ? "https" : "http",
    host: typeof sent === "string" && sent ? sent : undefined,
  } as const;
  const peer = nodeReq.socket.remoteAddress;
  if (!peer || !isLocalAddress(peer)) return direct;

  const proto = firstValue(nodeReq.headers["x-forwarded-proto"])?.toLowerCase();
  const host = firstValue(nodeReq.headers["x-forwarded-host"]);
  return {
    protocol: proto === "https" || proto === "http" ? proto : direct.protocol,
    host: host || direct.host,
  };
}

/**
 * The URL a Node request was addressed to, as its client saw it: its target
 * read against the scheme and host of {@link addressedTo} — the URL
 * `toWebRequest` gives the request.
 *
 * @param nodeReq - The incoming request
 * @returns The URL, or `undefined` for a target, or a host, no URL reads
 * @example
 * ```ts
 * const url = addressedURL(req);
 * if (url === undefined) return res.writeHead(400).end();
 * ```
 */
export function addressedURL(nodeReq: IncomingMessage): URL | undefined {
  const { protocol, host = "localhost" } = addressedTo(nodeReq);
  return parseUrl(nodeReq.url ?? "/", `${protocol}://${host}`);
}

/** The client-facing value of a forwarded header: the first of a chain. */
function firstValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(",")[0]?.trim() || undefined;
}
