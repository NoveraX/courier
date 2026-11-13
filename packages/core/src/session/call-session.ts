import { missingCapabilityCause } from "../capabilities/missing-capability";
import { serverCapability } from "../capabilities/registry";
import type { SessionCapability } from "../capabilities/session";
import { ConfigurationError } from "../errors/configuration-error";
import type { Context } from "../http-client/types";
import { isReactNative } from "../utils/is-react-native";
import { isOneUsersCall } from "../utils/one-users-call";
import { ownFields } from "../utils/own";
import { agentOf } from "../utils/server-call-marks";
import { browserSession, storedPageSession } from "./browser-session";
import type { IncomingRequest } from "./incoming-request";
import { namesRequest } from "./names-request";
import type * as NativeSession from "./native-session";
import { overSecureTransport } from "./one-user-transport";
import type { SessionTarget } from "./session-target";
import type { SessionOptions } from "./types";

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
  /**
   * Where the call goes, when the cookies its answer sets are kept here for
   * the calls to come: in a React Native app, whose platform keeps the
   * user's cookies where no script reads them
   */
  readonly learnsFrom?: string | undefined;
  /**
   * Where the double-submit token is asked for before the call: set for a
   * write that finds none, of an API that names where it comes from
   */
  readonly primeFrom?: string | undefined;
  /**
   * What tells the user's calls apart where the cookies the platform sends
   * are out of the call's reach — in a browser or an app; a cache with
   * scope `"session"` partitions by it
   */
  readonly partition?: string | undefined;
  /** Whether the call is a write that renews that partition once it is answered */
  readonly renewsPartition?: boolean | undefined;
}

/**
 * What the session and `forward` give a call, found as the call starts.
 *
 * The request being served is asked for synchronously, before the call
 * first waits — some frameworks know it only until then — and read when the
 * answer is awaited. A caller that named a request in its context is served
 * from it alone; an agent's call, from nothing; any other call, from the
 * request the registered adapters say is being served, when one is — on a
 * server that put a DOM on its global object too. With none, a browser
 * sends its own cookies and an app the ones it kept; a call of the
 * server's caller, a server's, carries no session then. What a server
 * reads of a request is the server's to lend — a page imports none of it.
 *
 * @param context - The call's context
 * @param target - The call's API and endpoint, as the session reads it
 * @returns What the call carries, now or once the request is found; `undefined` for nothing
 * @throws ConfigurationError `SERVER_CAPABILITY_MISSING` when the context names a request and no server lends a session
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
  /* An agent's call is the MCP server's own, made for the agent: nothing of a request being
     served, nor of a page, is the agent's to send. */
  if (agentOf(context)) return undefined;
  if (context !== undefined && namesRequest(context)) {
    /* Asked now, so a server checks what the call takes before the call reads any of it; what
       it refuses with — or that nothing here reads a request — is the call's as it awaits. */
    return new Promise((resolve) => {
      resolve(serverSession(target).contextSession(context, target));
    });
  }
  const served = serverCapability("session")?.ambientSession(target);
  if (served !== undefined) return served;
  return isOneUsersCall(context) ? oneUserSession(target) : undefined;
}

/**
 * The server's session, which a call that names the request it serves
 * cannot go without: sent without it, the call would carry none of the
 * user's credentials where its code counts on them.
 *
 * @param target - The call, named in the refusal
 * @returns The session the server lends
 * @throws ConfigurationError `SERVER_CAPABILITY_MISSING` when no server lends one
 * @example
 * ```ts
 * serverSession(target).relayCookies(upstream, session, false);
 * ```
 */
export function serverSession(target: Pick<SessionTarget, "name">): SessionCapability {
  const session = serverCapability("session");
  if (session !== undefined) return session;
  /* The advice for the likelier cause, and the other one beside it when it is known. */
  const cause = missingCapabilityCause();
  throw new ConfigurationError(
    "SERVER_CAPABILITY_MISSING",
    `[courier] ${target.name} names the request it serves in its context, and nothing here reads one: only a server does. On a server, make the caller with createCaller from @noverax/courier/server, or register the framework's request context with registerRequestContext${cause === undefined ? "" : `; ${cause}`}.`,
  );
}

/* A browser reads the cookies a page can, as the browser keeps them for a call that takes a token
   from them; a React Native app keeps them from the API's answers, with what a browser never loads.
   Either sends its session only where nothing reads it on the way. */
function oneUserSession(target: SessionTarget): CallSession | Promise<CallSession> | undefined {
  const session = target.session;
  if (session === undefined) return undefined;
  const secure = (found: CallSession) => overSecureTransport(target, found);
  if (isReactNative()) {
    return nativePart().then((native) => secure(native.nativeSession(target, session)));
  }
  return (
    storedPageSession(target, session)?.then(secure) ?? secure(browserSession(target, session))
  );
}

/**
 * The context the calls made for the same request go in after a call has
 * waited: the request it found, named, since a framework may know the
 * request being served only until the first wait. A context that named the
 * request already is kept as it was.
 *
 * @param context - The first call's context
 * @param session - What it carried
 * @returns The context to make the next call in
 * @example
 * ```ts
 * const again = await sessionFor(sameRequestContext(context, session), target);
 * ```
 */
export function sameRequestContext(
  context: Context | undefined,
  session: CallSession,
): Context | undefined {
  if (session.incoming === undefined) return context;
  if (context !== undefined && namesRequest(context)) return context;
  return ownFields({ ...context, incoming: session.incoming });
}

let native: Promise<typeof NativeSession> | undefined;

/* Loaded with an app's first call that carries a session; a load that failed is asked for again. */
function nativePart(): Promise<typeof NativeSession> {
  native ??= import("./native-session").catch((cause: unknown) => {
    native = undefined;
    throw cause;
  });
  return native;
}
