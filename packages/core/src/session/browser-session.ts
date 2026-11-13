import type { CallSession } from "./call-session";
import { cookieJarOf } from "./cookie-header";
import { renewSessionPartition, sessionPartition } from "./one-user-partition";
import { warnIfOtherSite } from "./other-site";
import { sessionCredentials } from "./session-credentials";
import type { SessionTarget } from "./session-target";
import type * as StoredCookies from "./stored-cookies";
import type { SessionOptions } from "./types";

/**
 * What a session gives a call made in a browser or a React Native app,
 * where the platform keeps the user's cookies and sends them itself.
 *
 * The call asks it to — `credentials: "include"`, so an API on another
 * origin of the page's site gets them too — unless the API set
 * `credentials` itself; an API on another site gets them only where the
 * browser lets it, which is said once. A bearer token, and a write's
 * double-submit token, are read from the cookies a script can read: the
 * page's copy of them in `document.cookie`, unless they are given. A write
 * that finds no token is to ask for it first, where the API names where it
 * comes from. Nothing else is added: a page cannot set `Cookie` or
 * `Origin`, and a header it need not send would cost the call a preflight.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @param jar - The cookies a script can read, by name: the page's copy, unless given
 * @returns What the call carries
 * @example
 * ```ts
 * browserSession(target, { cookies: ["sid"], csrf: { cookie: "XSRF-TOKEN", header: "x-xsrf-token" } });
 * ```
 */
export function browserSession(
  target: SessionTarget,
  session: SessionOptions,
  jar: ReadonlyMap<string, string> = pageCookies(),
): CallSession {
  return startBrowserCall(target, session)(jar);
}

/**
 * What a session gives a call made in a browser's page that takes a token
 * from the cookies — a write its double-submit token, any call a bearer
 * token — read from the cookies the browser keeps, where the page can ask
 * the browser's store for them.
 *
 * WebKit hands a page its cookies from a copy, which a cookie an answer
 * set reaches only after the answer reaches the page. A call made as the
 * answer arrives would read the cookies from before it: a write would
 * repeat no token, or the one the answer renewed, and the API refuse it; a
 * call would send no bearer token, or the one the answer replaced. The
 * store, which `cookieStore` asks, keeps the cookie before the page has
 * the answer. The part that asks it is loaded with the first call that
 * does. A call whose store fails, or whose part does not load, reads the
 * page's copy, as a call that takes no token does; the next call asks
 * again.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @returns What the call carries, once the store has listed the cookies; `undefined` for a call that takes no token from them, or a page with no store — one served over plain HTTP, or by a browser without it — which {@link browserSession} serves
 * @example
 * ```ts
 * const found = storedPageSession(target, session) ?? browserSession(target, session);
 * ```
 */
export function storedPageSession(
  target: SessionTarget,
  session: SessionOptions,
): Promise<CallSession> | undefined {
  const takesToken = Boolean(session.bearer) || (target.unsafeMethod && Boolean(session.csrf));
  if (!takesToken || !("cookieStore" in globalThis)) return undefined;
  /* Noted as the call starts, as any call's is: a read made once a write started is cached apart. */
  const carried = startBrowserCall(target, session);
  return storedPart()
    .then((part) => part.storedCookies())
    .then(
      (jar) => carried(jar ?? pageCookies()),
      () => carried(pageCookies()),
    );
}

/* What a call notes as it starts — an API on another site, said once, and a write, which renews
   the partition its user's reads are cached in — and what it carries, from the cookies a script
   can read once they are read. */
function startBrowserCall(
  target: SessionTarget,
  session: SessionOptions,
): (jar: ReadonlyMap<string, string>) => CallSession {
  warnIfOtherSite(target, session);
  if (target.unsafeMethod) renewSessionPartition();
  return (jar) => {
    const credentials = sessionCredentials(jar, session);
    const headers: Array<[string, string]> = [];
    if (credentials.bearer) headers.push(["authorization", `Bearer ${credentials.bearer}`]);
    if (credentials.csrf && session.csrf && target.unsafeMethod) {
      headers.push([session.csrf.header.toLowerCase(), credentials.csrf]);
    }
    const unknownToken = target.unsafeMethod && credentials.csrf === undefined;
    return {
      headers,
      fetchInit: target.credentials === undefined ? { credentials: "include" } : undefined,
      /* The platform sends the session's cookies itself, where no script sees
         them: whatever this call can read, it carries the session. */
      carries: target.credentials !== "omit" || credentials.identifies,
      options: session,
      toResponse: false,
      primeFrom: unknownToken ? session.csrf?.from : undefined,
      partition: sessionPartition(credentials),
      renewsPartition: target.unsafeMethod,
    };
  };
}

let stored: Promise<typeof StoredCookies> | undefined;

/* Loaded with the first call that reads the cookies the browser keeps; a load that failed is
   tried again by the next such call. */
function storedPart(): Promise<typeof StoredCookies> {
  stored ??= import("./stored-cookies").catch((cause: unknown) => {
    stored = undefined;
    throw cause;
  });
  return stored;
}

/* The cookies a script can read from the page's copy of them; none in React Native, which has no
   document, and keeps its cookies where no script reads them. */
function pageCookies(): Map<string, string> {
  const document: unknown = Object.hasOwn(globalThis, "document")
    ? Reflect.get(globalThis, "document")
    : undefined;
  const cookie: unknown =
    typeof document === "object" && document !== null ? Reflect.get(document, "cookie") : undefined;
  return cookieJarOf(typeof cookie === "string" ? cookie : undefined);
}
