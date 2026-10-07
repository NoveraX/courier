import { createLogger } from "../logger";
import type { CallSession } from "./call-session";
import { cookieForApp } from "./cookie-for-app";
import type { IncomingRequest, RelayedCookie } from "./incoming-request";
import { keepCookie } from "./request-state";
import { sessionCookies } from "./session-credentials";
import { parseSetCookie, type SetCookie, serializeSetCookie } from "./set-cookie";

const log = createLogger("Session");
/* One warning per cookie and reason: the same answer arrives with every call. */
const warned = new Set<string>();

/**
 * Take the session cookies an API's answer sets — renewed, or deleted on
 * signing out — and carry them on: the calls still to be made for the
 * request being served send them from now on, and the browser is handed
 * them, made for the application's origin. Cookies the session does not
 * name stay with the API.
 *
 * @param upstream - The headers the API answered with
 * @param session - What the call carried
 * @param toResponse - Whether the call is answered with a `Response` of its own,
 *   which then carries them instead of the request being served
 * @returns The `Set-Cookie` headers that answer has to carry
 * @example
 * ```ts
 * const cookies = relayCookies(result.headers, session, context?.res instanceof Response);
 * ```
 */
export function relayCookies(
  upstream: Headers | undefined,
  session: CallSession,
  toResponse: boolean,
): string[] {
  const { incoming, options } = session;
  if (upstream === undefined || incoming === undefined || options === undefined) return [];
  const { kept } = sessionCookies(options);
  const forResponse: string[] = [];
  for (const header of upstream.getSetCookie()) {
    const cookie = parseSetCookie(header);
    if (cookie === undefined || !kept(cookie.name)) continue;
    keepCookie(incoming, cookie);
    const relayed = options.relay === false ? undefined : relayedFor(cookie, incoming);
    if (relayed === undefined) continue;
    if (toResponse) forResponse.push(relayed.header);
    else handOver(incoming.setCookie?.(relayed), cookie.name);
  }
  return forResponse;
}

/* The cookie made for the application's origin, or nothing, said why, when it cannot be. */
function relayedFor(cookie: SetCookie, incoming: IncomingRequest): RelayedCookie | undefined {
  const made = cookieForApp(cookie, incoming.origin);
  if (made.cookie !== undefined)
    return { cookie: made.cookie, header: serializeSetCookie(made.cookie) };
  warnOnce(
    cookie.name,
    `The API set the session cookie, and it cannot be kept here: ${made.refused}`,
  );
  return undefined;
}

function handOver(result: true | string | undefined, name: string): void {
  if (result === true) return;
  warnOnce(
    name,
    `The API changed the session cookie, and the browser cannot be handed it: ${result ?? "nothing serves a response to carry it"}. The calls made for this request send the new value; the browser keeps the old one`,
  );
}

function warnOnce(name: string, message: string): void {
  const key = `${name}\u0000${message}`;
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(`${message} (${name})`);
}
