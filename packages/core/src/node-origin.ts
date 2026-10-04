import type { IncomingMessage } from "node:http";

import { isLocalAddress } from "./adapter/peer-address";

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
 * on a public address cannot claim another site's name.
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

/** The client-facing value of a forwarded header: the first of a chain. */
function firstValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(",")[0]?.trim() || undefined;
}
