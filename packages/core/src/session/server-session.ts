import type { Context } from "../http-client/types";
import type { CallSession } from "./call-session";
import { incomingFromContext } from "./context-incoming";
import { forwardedHeaders } from "./forward-headers";
import type { IncomingRequest } from "./incoming-request";
import { onBehalfOf } from "./on-behalf";
import { cookieJarFor } from "./request-state";
import { type SessionCredentials, sessionCredentials } from "./session-credentials";
import type { SessionTarget } from "./session-target";
import { assertSecureTransport } from "./transport";
import type { SessionOptions } from "./types";
import { writeRefusal } from "./write-guard";

/** How the request a call is served from relates to the call. */
interface Served {
  /** It passed the proxy's origin rule, which the guard would apply again */
  readonly admitted: boolean;
  /** The call answers it with a `Response` of its own */
  readonly toResponse: boolean;
}

const AMBIENT: Served = { admitted: false, toResponse: false };

/**
 * What the session gives a call that names the request it serves: an
 * adapter's description of it, the request a proxy request was made in
 * process for, the proxy's own request, or one server code passed.
 *
 * @param context - The call's context
 * @param target - The call, as the session reads it
 * @returns What the call carries, or `undefined` when the context names no request
 * @example
 * ```ts
 * contextSession({ req: request, res: new Response(), proxyMethod: "POST" }, target);
 * ```
 */
export function contextSession(context: Context, target: SessionTarget): CallSession | undefined {
  /* An adapter's description, or the request a proxy request was made in
     process for, is the request the user made. */
  const described = context.incoming ?? onBehalfOf(context.req);
  if (described !== undefined) return serverSession(described, target, AMBIENT);
  const named = incomingFromContext(context);
  if (named === undefined) return undefined;
  /* A request the proxy serves has passed its origin rule already, the one
     the guard applies, with the proxy's own list of origins. */
  const admitted = context.proxyMethod !== undefined;
  return serverSession(named, target, { admitted, toResponse: context.res instanceof Response });
}

/**
 * What the session gives a call made while a registered adapter's request
 * is served.
 *
 * @param incoming - The request being served
 * @param target - The call, as the session reads it
 * @returns What the call carries
 * @example
 * ```ts
 * ambientSession(await captureIncomingRequest(), target);
 * ```
 */
export function ambientSession(incoming: IncomingRequest, target: SessionTarget): CallSession {
  return serverSession(incoming, target, AMBIENT);
}

function serverSession(
  incoming: IncomingRequest,
  target: SessionTarget,
  served: Served,
): CallSession {
  const session = target.session;
  const credentials = session ? sessionCredentials(cookieJarFor(incoming), session) : undefined;
  const carries = credentials?.identifies === true;
  if (carries && session?.allowHttp !== true) assertSecureTransport(target);
  const vouched =
    session && credentials ? vouchedHeaders(incoming, target, session, credentials) : [];
  /* A write that finds no token asks for one first, where the API names where it comes from. */
  const primeFrom =
    target.unsafeMethod && credentials?.csrf === undefined ? session?.csrf?.from : undefined;
  /* The double-submit token vouches for a write as much as the session does,
     and so does the token the write would ask for: a sign-in made with it
     for a page on another site signs the user in to whatever account that
     page chose. */
  const vouches =
    carries ||
    primeFrom !== undefined ||
    vouched.some(([name]) => name === session?.csrf?.header.toLowerCase());
  const refusal = vouches && !served.admitted ? guardRefusal(incoming, target, session) : undefined;
  return {
    incoming,
    headers: [...vouched, ...(target.forward ? forwardedHeaders(incoming, target.forward) : [])],
    fetchInit: incoming.fetchInit,
    carries,
    options: session,
    refusal,
    toResponse: served.toResponse,
    primeFrom: refusal === undefined ? primeFrom : undefined,
  };
}

/* The user's credentials, and what a double-submit check asks a call to repeat. */
function vouchedHeaders(
  incoming: IncomingRequest,
  target: SessionTarget,
  session: SessionOptions,
  credentials: SessionCredentials,
): Array<[string, string]> {
  const headers: Array<[string, string]> = [];
  if (credentials.cookie) headers.push(["cookie", credentials.cookie]);
  if (credentials.bearer) headers.push(["authorization", `Bearer ${credentials.bearer}`]);
  if (session.csrf === undefined) return headers;
  if (credentials.csrf && target.unsafeMethod) {
    headers.push([session.csrf.header.toLowerCase(), credentials.csrf]);
  }
  /* Django, and Laravel Sanctum, take a call for a page of the application
     only when it names one; the origin alone says which, and no more. */
  if (incoming.origin) headers.push(["referer", `${incoming.origin}/`]);
  return headers;
}

/* A write the endpoint does not leave unguarded is vouched for only for the application's own pages. */
function guardRefusal(
  incoming: IncomingRequest,
  target: SessionTarget,
  session: SessionOptions | undefined,
): string | undefined {
  if (!target.writes || target.unguarded) return undefined;
  const reason = writeRefusal(incoming, session?.allowedOrigins);
  return reason === undefined
    ? undefined
    : `${target.name} would write on the user's behalf while the application serves ${requestNamed(incoming)}, and ${reason}. Make the write from the application's own form or Server Action, or give the endpoint { session: "unguarded" } if a stranger setting it off does no harm`;
}

function requestNamed(incoming: IncomingRequest): string {
  return incoming.method === undefined ? "a request" : `a ${incoming.method.toUpperCase()} request`;
}
