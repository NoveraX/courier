import type { CallSession } from "./call-session";
import type { SessionTarget } from "./session-target";
import type * as Transport from "./transport";

let transport: Promise<typeof Transport> | undefined;

/* Loaded with the first call that might carry the session over plain HTTP: over HTTPS, and to a
   path on the page's own origin, nothing more is asked of where a call goes. A load that failed is
   tried again by the next call: Node and React Native fetch the module anew, while a browser may
   answer with the failure it kept for the module's address, and a module that threw as it ran
   throws again everywhere, as an ES module that failed so is kept. */
function transportPart(): Promise<typeof Transport> {
  transport ??= import("./transport").catch((cause: unknown) => {
    transport = undefined;
    throw cause;
  });
  return transport;
}

/**
 * A page's or an app's session, carried only where nothing on the way
 * reads it, as a server's is: a call that would carry it over plain HTTP
 * across the public internet is refused, unless the API's session allows
 * plain HTTP. A check that does not load fails the call with why it did
 * not: the session settles before any attempt, so nothing is sent and no
 * retry sends it.
 *
 * @param target - The call, and where it goes
 * @param session - What the page's or the app's session gives the call
 * @returns The session, once the call may carry it
 * @throws ConfigurationError `SESSION_INSECURE_TRANSPORT`, over plain HTTP across the internet
 * @example
 * ```ts
 * return overSecureTransport(target, browserSession(target, session));
 * ```
 */
export function overSecureTransport(
  target: SessionTarget,
  session: CallSession,
): CallSession | Promise<CallSession> {
  /* Over HTTPS or WSS, or to a path on the page's own origin, as the address is written: the
     parser reads nothing else into it. Anything else — a blank before it, a tab or a newline in
     it, which the parser drops — the check reads as the parser does. */
  const url = target.url;
  const secure = url === undefined || /^(?:https:|wss:|\/[^/\\\t\n\r])/i.test(url);
  if (secure || !session.carries || session.options?.allowHttp === true) return session;
  return transportPart().then(({ assertSecureTransport }) => {
    assertSecureTransport(target);
    return session;
  });
}
