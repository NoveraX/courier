import type { CallSession } from "./call-session";
import { cookieJarOf } from "./cookie-header";
import { renewSessionPartition, sessionPartition } from "./one-user-partition";
import { warnIfOtherSite } from "./other-site";
import { sessionCredentials } from "./session-credentials";
import type { SessionTarget } from "./session-target";
import type { SessionOptions } from "./types";

/**
 * What a session gives a call made in a browser or a React Native app,
 * where the platform keeps the user's cookies and sends them itself.
 *
 * The call asks it to — `credentials: "include"`, so an API on another
 * origin of the page's site gets them too — unless the API set
 * `credentials` itself; an API on another site gets them only where the
 * browser lets it, which is said once. A bearer
 * token, and a write's double-submit token, are read from `document.cookie`
 * where the page can read them; a write that finds no token is to ask for
 * it first, where the API names where it comes from. Nothing else is added: a page cannot set
 * `Cookie` or `Origin`, and a header it need not send would cost the call a
 * preflight.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @param jar - The cookies a script can read, by name: the page's, unless given
 * @returns What the call carries
 * @example
 * ```ts
 * browserSession(target, { cookies: ["sid"], csrf: { cookie: "XSRF-TOKEN", header: "x-xsrf-token" } });
 * ```
 */
export function browserSession(
  target: SessionTarget,
  session: SessionOptions,
  jar: ReadonlyMap<string, string> = cookieJarOf(documentCookie()),
): CallSession {
  const credentials = sessionCredentials(jar, session);
  warnIfOtherSite(target, session);
  const headers: Array<[string, string]> = [];
  if (credentials.bearer) headers.push(["authorization", `Bearer ${credentials.bearer}`]);
  if (credentials.csrf && session.csrf && target.unsafeMethod) {
    headers.push([session.csrf.header.toLowerCase(), credentials.csrf]);
  }
  const unknownToken = target.unsafeMethod && credentials.csrf === undefined;
  if (target.unsafeMethod) renewSessionPartition();
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
}

/* React Native has no document, and keeps its cookies where no script reads them. */
function documentCookie(): string | undefined {
  const document: unknown = Reflect.get(globalThis, "document");
  const cookie: unknown =
    typeof document === "object" && document !== null ? Reflect.get(document, "cookie") : undefined;
  return typeof cookie === "string" ? cookie : undefined;
}
