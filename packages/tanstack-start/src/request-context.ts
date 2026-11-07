import { forwardedChain } from "@noverax/courier/internal";
import {
  createLogger,
  type IncomingRequest,
  type RequestContextProvider,
} from "@noverax/courier/server";

import { connectionOf } from "./connection";
import type { StartServer } from "./start-server";

const log = createLogger("TanStack Start");

const HANDED_BACK =
  "the response had already been handed back — a page waits only for what its loaders await";

/* The requests whose response has left, one set for the process however many
   copies of this module a bundler loads: a request marked from one is known to another. */
const ANSWERED = Symbol.for("courier.tanstackStart.answered");

function answered(): WeakSet<Request> {
  const existing: unknown = Reflect.get(globalThis, ANSWERED);
  if (existing instanceof WeakSet) return existing as WeakSet<Request>;
  const created = new WeakSet<Request>();
  Reflect.set(globalThis, ANSWERED, created);
  return created;
}

/**
 * Mark a request answered: its response has left TanStack Start, and a
 * cookie set for it from now on cannot reach the browser.
 *
 * @param request - The request, as TanStack Start serves it
 * @example
 * ```ts
 * try { return await next(); } finally { markAnswered(request); }
 * ```
 */
export function markAnswered(request: Request): void {
  answered().add(request);
}

/**
 * The request TanStack Start is serving, found with its own `getRequest`:
 * in a server function, a page the server renders, a server route, a
 * request middleware — through every `await`. TanStack Start keeps it
 * itself, so nothing more is needed to find it. Outside a request there
 * is none, and the provider answers so.
 *
 * @param server - TanStack Start's server runtime, as an entry binds it
 * @returns The provider, for `registerRequestContext`
 * @example
 * ```ts
 * registerRequestContext(startRequestContext({ getRequest, appendResponseHeader }));
 * ```
 */
export function startRequestContext(server: StartServer): RequestContextProvider {
  return () => {
    const request = servedRequest(server);
    return request === undefined ? undefined : startIncomingRequest(request, server);
  };
}

function servedRequest(server: StartServer): Request | undefined {
  try {
    return server.getRequest();
  } catch (error) {
    /* A job, a warm-up, a script: TanStack Start serves no request there, and says so by throwing. */
    log.debug("No request to take a session from", error);
    return undefined;
  }
}

/**
 * A request TanStack Start serves, as the session reads it. The user's
 * address is the connection's, after the chain a local proxy recorded. A
 * cookie the API sets goes to the response being prepared through
 * TanStack Start's own `appendResponseHeader`, exactly as the API wrote
 * it, until the response has left; after that the call is told why it
 * could not be handed over.
 *
 * @param request - The request being served
 * @param server - TanStack Start's server runtime, as an entry binds it
 * @returns The request, as the session reads it
 * @example
 * ```ts
 * startIncomingRequest(getRequest(), { getRequest, appendResponseHeader });
 * ```
 */
export function startIncomingRequest(request: Request, server: StartServer): IncomingRequest {
  return {
    key: request,
    method: request.method,
    origin: URL.canParse(request.url) ? new URL(request.url).origin : undefined,
    headers: request.headers,
    clientAddress: forwardedChain(
      connectionOf(request).address,
      request.headers.get("x-forwarded-for"),
    ),
    setCookie: ({ header }) => {
      if (answered().has(request)) return HANDED_BACK;
      server.appendResponseHeader("set-cookie", header);
      return true;
    },
  };
}
