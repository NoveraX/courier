import type { CallSession } from "./call-session";
import { cookieJarOf } from "./cookie-header";
import { sessionCredentials } from "./session-credentials";
import type { SessionTarget } from "./session-target";
import type { SessionOptions } from "./types";

/**
 * What a session gives a call made in a browser or a React Native app,
 * where the platform keeps the user's cookies and sends them itself.
 *
 * The call asks it to — `credentials: "include"`, so an API on another
 * origin gets them too — unless the API set `credentials` itself. A bearer
 * token, and a write's double-submit token, are read from `document.cookie`
 * where the page can read them. Nothing else is added: a page cannot set
 * `Cookie` or `Origin`, and a header it need not send would cost the call a
 * preflight.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @returns What the call carries
 * @example
 * ```ts
 * browserSession(target, { cookies: ["sid"], csrf: { cookie: "XSRF-TOKEN", header: "x-xsrf-token" } });
 * ```
 */
export function browserSession(target: SessionTarget, session: SessionOptions): CallSession {
  const credentials = sessionCredentials(cookieJarOf(documentCookie()), session);
  const headers: Array<[string, string]> = [];
  if (credentials.bearer) headers.push(["authorization", `Bearer ${credentials.bearer}`]);
  if (credentials.csrf && session.csrf && target.unsafeMethod) {
    headers.push([session.csrf.header.toLowerCase(), credentials.csrf]);
  }
  return {
    headers,
    fetchInit: target.credentials === undefined ? { credentials: "include" } : undefined,
    carries: credentials.identifies,
    options: session,
  };
}

/* React Native has no document, and keeps its cookies where no script reads them. */
function documentCookie(): string | undefined {
  const document: unknown = Reflect.get(globalThis, "document");
  const cookie: unknown =
    typeof document === "object" && document !== null ? Reflect.get(document, "cookie") : undefined;
  return typeof cookie === "string" ? cookie : undefined;
}
