import { PROTOCOL_VERSION } from "@noverax/courier/internal";
import { qualifyTopic } from "@noverax/courier/realtime";
import { codeString, codeValue, shellEscape } from "@/lib/snippet-values";
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
  return { auth, subscribe };
}

/* A socket's address as a ws:// or wss:// URL, an HTTP address too, which a
   browser released before the standard took one refuses; none for any other. */
function socketUrl(url: string): string | undefined {
  const scheme = /^(?:ws|http)s?(?=:\/\/)/i.exec(url)?.[0];
  return scheme && `${scheme.toLowerCase().replace("http", "ws")}${url.slice(scheme.length)}`;
}

/* websocat reads an address as a socket's URL only when it starts with
   ws:// or wss://: one that starts with another name and a colon it reads
   as another kind of address, and some of those run a program or open a
   file. Any other is written under a host for the reader to fill in. */
function socketAddress(url: string): string {
  return socketUrl(url) ?? `ws://<host>${url.startsWith("/") ? "" : "/"}${url}`;
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
    `const socket = new WebSocket(${codeString(socketUrl(url) ?? url)});`,
    "",
    `socket.onopen = () => socket.send(JSON.stringify(${codeValue(auth)}));`,
    "socket.onmessage = (event) => {",
    "  const frame = JSON.parse(event.data);",
    `  if (frame.type === "auth_ok") socket.send(JSON.stringify(${codeValue(subscribe)}));`,
    `  else if (frame.type === "ping") socket.send(JSON.stringify({ type: "pong" }));`,
    "  else console.log(frame);",
    "};",
  ].join("\n");
}

/**
 * A websocat command for a WebSocket request. Its headers go on the
 * handshake; it sends `auth` and the subscribe at once — the server holds
 * what comes after `auth` until it has let the socket in — then a `pong`
 * every 5 s, within the 10 s the server gives each of its pings. An
 * address that names no socket, as the path of a recorded request, is
 * written under `ws://<host>`, for the reader to fill in.
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
    `    '${shellEscape(JSON.stringify(auth))}' \\`,
    `    '${shellEscape(JSON.stringify(subscribe))}'`,
    `  while sleep 5; do echo '{"type":"pong"}'; done`,
    `} | ${["websocat", `'${shellEscape(socketAddress(url))}'`, ...flags].join(" \\\n  ")}`,
  ].join("\n");
}
