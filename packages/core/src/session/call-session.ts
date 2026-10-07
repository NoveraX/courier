import type { Context } from "../http-client/types";
import { servesOneUser } from "../utils/serves-one-user";
import { browserSession } from "./browser-session";
import type { IncomingRequest } from "./incoming-request";
import { captureIncomingRequest } from "./request-context";
import type * as ServerSession from "./server-session";
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
}

/**
 * What the session and `forward` give a call, found as the call starts.
 *
 * The request being served is asked for synchronously, before the call
 * first waits — some frameworks know it only until then — and read when the
 * answer is awaited. A caller that named a request in its context is served
 * from it alone; a browser sends its own cookies; elsewhere the registered
 * adapters say which request is being served, if any is. What a server
 * reads of a request is loaded with the first call that reads one, so a
 * browser never loads it.
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
  if (context !== undefined && namesRequest(context)) {
    return serverPart().then((server) => server.contextSession(context, target));
  }
  if (servesOneUser()) return target.session ? browserSession(target, target.session) : undefined;
  const found = captureIncomingRequest();
  if (found === undefined) return undefined;
  return Promise.all([found, serverPart()]).then(([incoming, server]) =>
    incoming === undefined ? undefined : server.ambientSession(incoming, target),
  );
}

/* A caller's context names the request it serves, or the proxy's own. */
function namesRequest(context: Context): boolean {
  return (
    context.incoming !== undefined || context.req !== undefined || context.headers !== undefined
  );
}

let server: Promise<typeof ServerSession> | undefined;

function serverPart(): Promise<typeof ServerSession> {
  server ??= import("./server-session");
  return server;
}
