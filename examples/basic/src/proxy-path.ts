/**
 * Where the application's server answers proxied calls, streams and
 * sockets. A page would name its own origin's paths — `/api/request` —
 * but the callers here run in Node, so they name the server.
 */
export const PROXY_PATH = {
  http: "http://127.0.0.1:3001/api/request",
  sse: "http://127.0.0.1:3001/api/sse",
  ws: "ws://127.0.0.1:3001/ws",
} as const;
