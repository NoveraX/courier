import type { SessionCapability } from "../../capabilities/session";
import type { CallSession } from "../../session/call-session";
import type { IncomingRequest } from "../../session/incoming-request";
import type { SessionTarget } from "../../session/session-target";
import type * as Forwarded from "../../utils/forwarded-for";
import { checkedTarget } from "./checked-target";
import type * as Relay from "./relay";
import { captureIncomingRequest, requestBeingServed } from "./request-providers";
import type * as ServerSession from "./server-session";

let session: Promise<typeof ServerSession> | undefined;
let relay: Promise<typeof Relay> | undefined;
let forwarded: Promise<typeof Forwarded> | undefined;

/* Loaded with the first call that reads a request, not with the module
   that lends them: the root's caller lends the server's part wherever it
   runs, and a page that imports it from there never reads a request. A
   load that failed is asked for again by the next call. */
function sessionPart(): Promise<typeof ServerSession> {
  session ??= import("./server-session").catch((cause: unknown) => {
    session = undefined;
    throw cause;
  });
  return session;
}

function relayPart(): Promise<typeof Relay> {
  relay ??= import("./relay").catch((cause: unknown) => {
    relay = undefined;
    throw cause;
  });
  return relay;
}

function forwardedPart(): Promise<typeof Forwarded> {
  forwarded ??= import("../../utils/forwarded-for").catch((cause: unknown) => {
    forwarded = undefined;
    throw cause;
  });
  return forwarded;
}

/**
 * The server's session for the calls of its process. What the call takes
 * of its options is checked as the call asks for the session — before the
 * call reads anything of what it takes — and the request being served is
 * asked for as the call starts; what the session gives the call is read
 * once the server's part has loaded. What the check or the reading refuses
 * — a header list that carries cookies past the session, a session over
 * plain HTTP — is the call's failure as the call awaits it.
 */
export const SERVER_SESSION: SessionCapability = {
  contextSession: async (context, target) => {
    const call = checkedTarget(target);
    return (await sessionPart()).contextSession(context, call);
  },
  ambientSession: (target) => {
    const found = captureIncomingRequest();
    return found === undefined ? undefined : ambientCall(found, target);
  },
  relayCookies: async (upstream, served, toResponse) =>
    (await relayPart()).relayCookies(upstream, served, toResponse),
  forwardedFor: async (request) => (await forwardedPart()).forwardedFor(request),
  servesRequest: requestBeingServed,
};

async function ambientCall(
  found: IncomingRequest | Promise<IncomingRequest | undefined>,
  target: SessionTarget,
): Promise<CallSession | undefined> {
  const loaded = Promise.all([found, sessionPart()]);
  /* Awaited below, unless the check refuses the call first. */
  loaded.catch(() => undefined);
  const call = checkedTarget(target);
  const [incoming, server] = await loaded;
  return incoming === undefined ? undefined : server.ambientSession(incoming, call);
}
