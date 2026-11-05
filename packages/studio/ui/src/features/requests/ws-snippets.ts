import { PROTOCOL_VERSION } from "@noverax/courier/internal";
import { qualifyTopic } from "@noverax/courier/realtime";
import { shellEscape } from "@/lib/snippets";
import type { SnippetRequest } from "./request-snippets";

/*
 * A WebSocket request written out as a Courier client speaks to its server:
 * the socket's first frame is `auth` of the protocol's version, the
 * request's topic is subscribed to, and the server's pings are answered —
 * a socket that sends nothing is closed after a few seconds, and one that
 * answers no ping after the server's heartbeat.
 */

/* The topic a Courier client subscribes a request's channel by: its endpoint, keyed by its variables. */
function topicOf(r: SnippetRequest): string {
  const source = r.source ?? "_";
  const base = r.group ? `${source}.${r.group}.${r.method}` : `${source}.${r.method}`;
  return qualifyTopic(base, r.variables);
}

/* The two frames a socket opens with; the headers go in `auth` only where the handshake cannot carry them. */
function framesOf(r: SnippetRequest, frameHeaders?: Record<string, string>) {
  const headers =
    frameHeaders && Object.keys(frameHeaders).length > 0 ? { headers: frameHeaders } : {};
  const auth = { type: "auth", v: PROTOCOL_VERSION, id: "a1", payload: headers };
  const subscribe = {
    type: "subscribe",
    id: "s1",
    topic: topicOf(r),
    ...(r.variables !== undefined && { payload: r.variables }),
  };
  return { auth: JSON.stringify(auth), subscribe: JSON.stringify(subscribe) };
}

/**
 * Browser code for a WebSocket request. A page's socket takes no headers on
 * its handshake, so they go in its `auth` frame, as a Courier client in a
 * browser sends them; the topic is subscribed to once `auth_ok` lets the
 * socket in.
 *
 * @param r - The request
 * @param url - Its socket's address
 * @param headers - Its headers, credentials left out as the snippet says
 * @returns The code
 * @example
 * ```ts
 * wsBrowserSnippet(request, "ws://localhost:5173/api/ws", { authorization: "<redacted>" });
 * ```
 */
export function wsBrowserSnippet(
  r: SnippetRequest,
  url: string,
  headers: Record<string, string>,
): string {
  const { auth, subscribe } = framesOf(r, headers);
  return [
    `const socket = new WebSocket("${url}");`,
    "",
    `socket.onopen = () => socket.send(JSON.stringify(${auth}));`,
    "socket.onmessage = (event) => {",
    "  const frame = JSON.parse(event.data);",
    `  if (frame.type === "auth_ok") socket.send(JSON.stringify(${subscribe}));`,
    `  else if (frame.type === "ping") socket.send(JSON.stringify({ type: "pong" }));`,
    "  else console.log(frame);",
    "};",
  ].join("\n");
}

/**
 * A websocat command for a WebSocket request. Its headers go on the
 * handshake; it sends `auth` and the subscribe at once — the server holds
 * what comes after `auth` until it has let the socket in — then a `pong`
 * every 5 s, within the 10 s the server gives each of its pings.
 *
 * @param r - The request
 * @param url - Its socket's address
 * @param headers - Its headers, credentials left out as the snippet says
 * @returns The command
 * @example
 * ```ts
 * wsShellSnippet(request, "ws://localhost:5173/api/ws", {});
 * ```
 */
export function wsShellSnippet(
  r: SnippetRequest,
  url: string,
  headers: Record<string, string>,
): string {
  const { auth, subscribe } = framesOf(r);
  const flags = Object.entries(headers).map(([k, v]) => `-H '${shellEscape(`${k}: ${v}`)}'`);
  return [
    "{",
    `  printf '%s\\n' \\`,
    `    '${shellEscape(auth)}' \\`,
    `    '${shellEscape(subscribe)}'`,
    `  while sleep 5; do echo '{"type":"pong"}'; done`,
    `} | ${["websocat", `'${shellEscape(url)}'`, ...flags].join(" \\\n  ")}`,
  ].join("\n");
}
