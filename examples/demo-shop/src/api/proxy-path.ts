import { PORTS } from "../ports";

/**
 * Where the shop's own server answers proxied calls, streams and sockets.
 * A page names its own origin's paths — `/api/request` — but the shoppers
 * here run in Node, so they name the server.
 */
export const PROXY_PATH = {
  http: `http://127.0.0.1:${PORTS.app}/api/request`,
  sse: `http://127.0.0.1:${PORTS.app}/api/sse`,
  ws: `ws://127.0.0.1:${PORTS.app}/ws`,
} as const;
