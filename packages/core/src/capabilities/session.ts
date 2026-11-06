import type { Context } from "../http-client/types";
import type { CallSession } from "../session/call-session";
import type { SessionTarget } from "../session/session-target";

/**
 * What a server lends a call that keeps the user's `session` or
 * `forward`s a request's headers: the session read from the request being
 * served, the cookies an answer sets carried on to that request's user,
 * and the addresses a call made for that request carries on.
 */
export interface SessionCapability {
  /**
   * What the session gives a call whose context names the request it
   * serves — an adapter's description of it, the proxy's own request, or
   * one server code passed.
   *
   * @param context - The call's context
   * @param target - The call, as the session reads it
   * @returns What the call carries, once read; `undefined` when the context names no request
   */
  contextSession(context: Context, target: SessionTarget): Promise<CallSession | undefined>;
  /**
   * The request being served, asked of the registered adapters
   * synchronously — some frameworks know it only until the calling code
   * first waits — and what the session gives a call made for it.
   *
   * @param target - The call, as the session reads it
   * @returns What the call carries, once read; `undefined` when no request is being served
   */
  ambientSession(target: SessionTarget): Promise<CallSession | undefined> | undefined;
  /**
   * Carry the session cookies an answer set on: the calls still to be made
   * for the request being served send them, and its user's browser is
   * handed them.
   *
   * @param upstream - The answer's headers
   * @param session - What the call carried
   * @param toResponse - Whether the cookies go on the `Response` the call answers with
   * @returns The `Set-Cookie` headers that `Response` carries
   */
  relayCookies(
    upstream: Headers | undefined,
    session: CallSession,
    toResponse: boolean,
  ): Promise<string[]>;
  /**
   * The `X-Forwarded-For` a call made on behalf of a request carries
   * upstream: the chain the proxies in front of the server recorded, with
   * the address the request came from.
   *
   * @param request - The request the call is made for
   * @returns The chain, once read; `undefined` when nothing recorded an address
   */
  forwardedFor(request: Request): Promise<string | undefined>;
  /**
   * Whether a request is being served as a call starts, as the registered
   * adapters say — or may be, where one answers only later: a call made
   * then is that request's user's.
   *
   * @returns `true` while one is
   */
  servesRequest(): boolean;
}
