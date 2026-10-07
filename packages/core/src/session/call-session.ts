import type { Context } from "../http-client/types";
import { servesOneUser } from "../utils/serves-one-user";
import { browserSession } from "./browser-session";
import { incomingFromContext } from "./context-incoming";
import { forwardedHeaders } from "./forward-headers";
import type { IncomingRequest } from "./incoming-request";
import { onBehalfOf } from "./on-behalf";
import { captureIncomingRequest, isPromise } from "./request-context";
import { cookieJarFor } from "./request-state";
import { type SessionCredentials, sessionCredentials } from "./session-credentials";
import type { SessionTarget } from "./session-target";
import { assertSecureTransport } from "./transport";
import type { SessionOptions } from "./types";
import { writeRefusal } from "./write-guard";

/** What the user's session and the request being served give one call. */
export interface CallSession {
  /** The request being served; none in a browser */
  readonly incoming?: IncomingRequest | undefined;
  /** Headers to send where the call itself set none */
  readonly headers: ReadonlyArray<readonly [string, string]>;
  /** What `fetch` has to be given for the call */
  readonly fetchInit?: Readonly<RequestInit> | undefined;
  /** Whether it carries credentials that say who the user is */
  readonly carries: boolean;
  /** The session the call took, for the cookies its answer sets */
  readonly options?: SessionOptions | undefined;
  /** Why the call may not be made with the session, when it may not */
  readonly refusal?: string | undefined;
  /**
   * Whether the cookies the API sets go to the browser on the `Response`
   * the call answers with — the proxy's — rather than through the request
   * being served
   */
  readonly toResponse: boolean;
}

/** How the request a call is served from relates to the call. */
interface Served {
  /** It passed the proxy's origin rule, which the guard would apply again */
  readonly admitted: boolean;
  /** The call answers it with a `Response` of its own */
  readonly toResponse: boolean;
}

const AMBIENT: Served = { admitted: false, toResponse: false };

/**
 * What the session and `forward` give a call, found as the call starts.
 *
 * The request being served is asked for synchronously, before the call
 * first waits — some frameworks know it only until then — and read when the
 * answer is awaited. A caller that named a request in its context is served
 * from it alone; a browser sends its own cookies; elsewhere the registered
 * adapters say which request is being served, if any is.
 *
 * @param context - The call's context
 * @param target - The call's API and endpoint, as the session reads them
 * @returns What the call carries, now or once the request is found; `undefined` for nothing
 * @example
 * ```ts
 * const session = await sessionFor(context, target);
 * ```
 */
export function sessionFor(
  context: Context | undefined,
  target: SessionTarget,
): CallSession | Promise<CallSession | undefined> | undefined {
  if (target.session === undefined && target.forward === undefined) return undefined;
  /* An adapter's description, or the request a proxy request was made in
     process for, is the request the user made. */
  const described = context?.incoming ?? onBehalfOf(context?.req);
  if (described !== undefined) return serverSession(described, target, AMBIENT);
  const named = incomingFromContext(context);
  /* A request the proxy serves has passed its origin rule already, the one
     the guard applies, with the proxy's own list of origins. */
  if (named !== undefined) {
    const admitted = context?.proxyMethod !== undefined;
    return serverSession(named, target, { admitted, toResponse: context?.res instanceof Response });
  }
  if (servesOneUser()) return target.session ? browserSession(target, target.session) : undefined;
  const found = captureIncomingRequest();
  if (found === undefined) return undefined;
  if (!isPromise(found)) return serverSession(found, target, AMBIENT);
  return found.then((incoming) =>
    incoming ? serverSession(incoming, target, AMBIENT) : undefined,
  );
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
  /* The double-submit token vouches for a write as much as the session does:
     a sign-in made with it for a page on another site signs the user in to
     whatever account that page chose. */
  const vouches = carries || vouched.some(([name]) => name === session?.csrf?.header.toLowerCase());
  return {
    incoming,
    headers: [...vouched, ...(target.forward ? forwardedHeaders(incoming, target.forward) : [])],
    fetchInit: incoming.fetchInit,
    carries,
    options: session,
    refusal: vouches && !served.admitted ? guardRefusal(incoming, target, session) : undefined,
    toResponse: served.toResponse,
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
