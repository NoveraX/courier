import type { OutgoingHttpHeaders, ServerResponse } from "node:http";

/* The cookies added to each response, kept until its head is written. */
const HELD = new WeakMap<ServerResponse, string[]>();

/**
 * Add a `Set-Cookie` header to a Node response whose head has not been sent,
 * kept beside the cookies the server sets itself until the head is written.
 * A server that hands `writeHead` headers of its own — Fastify does, and
 * srvx — has those appended rather than put in its place, and one that
 * sets the header again with `setHeader` has it put back first, so a
 * cookie of the application's own by the same name still wins. The head
 * is watched as `on-headers` watches it for express-session.
 *
 * @param res - The response being prepared
 * @param header - The `Set-Cookie` header
 * @returns `true`, or why the cookie cannot be added
 * @example
 * ```ts
 * appendSetCookie(res, "sid=a1; Path=/; HttpOnly");
 * ```
 */
export function appendSetCookie(res: ServerResponse, header: string): true | string {
  if (res.headersSent) return "the response had already been sent";
  res.appendHeader("set-cookie", header);
  const held = HELD.get(res);
  if (held !== undefined) held.push(header);
  else keepThroughWriteHead(res, [header]);
  return true;
}

function keepThroughWriteHead(res: ServerResponse, held: string[]): void {
  HELD.set(res, held);
  const writeHead = res.writeHead;
  const keeping = (...args: unknown[]): ServerResponse => {
    res.writeHead = writeHead;
    const at = typeof args[1] === "string" ? 2 : 1;
    if (args.length > at) args[at] = withoutCookies(res, args[at]);
    putBack(res, held);
    Reflect.apply(writeHead, res, args);
    return res;
  };
  res.writeHead = keeping as ServerResponse["writeHead"];
}

/* The ones the application set the header over since go back first. */
function putBack(res: ServerResponse, held: readonly string[]): void {
  const current = res.getHeader("set-cookie");
  const now = current === undefined ? [] : [current].flat().map(String);
  const missing = held.filter((cookie) => !now.includes(cookie));
  if (missing.length > 0) res.setHeader("set-cookie", [...missing, ...now]);
}

/* The headers with their cookies moved onto those already set. */
function withoutCookies(res: ServerResponse, headers: unknown): unknown {
  if (Array.isArray(headers)) return withoutCookiesInList(res, headers);
  if (typeof headers !== "object" || headers === null) return headers;
  const kept: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers as OutgoingHttpHeaders)) {
    if (name.toLowerCase() !== "set-cookie") kept[name] = value;
    else if (value !== undefined) res.appendHeader("set-cookie", cookiesOf(value));
  }
  return kept;
}

/* Node's flat form: a name, then its value, then the next name. */
function withoutCookiesInList(res: ServerResponse, list: readonly unknown[]): unknown[] {
  const kept: unknown[] = [];
  for (let at = 0; at + 1 < list.length; at += 2) {
    const [name, value] = [list[at], list[at + 1]];
    if (typeof name !== "string" || name.toLowerCase() !== "set-cookie") kept.push(name, value);
    else if (value !== undefined) res.appendHeader("set-cookie", cookiesOf(value));
  }
  return kept;
}

function cookiesOf(value: unknown): string | string[] {
  return Array.isArray(value) ? value.map(String) : String(value);
}
