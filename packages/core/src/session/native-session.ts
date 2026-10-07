import { browserSession } from "./browser-session";
import type { CallSession } from "./call-session";
import { learnedJar } from "./learned-cookies";
import type { SessionTarget } from "./session-target";
import type { SessionOptions } from "./types";

/**
 * What a session gives a call made in a React Native app. The platform keeps
 * the user's cookies and sends them itself, as a browser does —
 * `credentials: "include"` asks it to — but keeps them where no script reads
 * them: there is no `document.cookie`. A script is handed the `Set-Cookie`
 * headers of each answer instead, so the cookies a page would read there —
 * the double-submit token, a bearer token not set `HttpOnly` — are kept from
 * the API's answers as they arrive, and repeated as a page repeats them.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @returns What the call carries, and where the cookies its answer sets are kept from
 * @example
 * ```ts
 * nativeSession(target, { cookies: ["sessionid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } });
 * ```
 */
export function nativeSession(target: SessionTarget, session: SessionOptions): CallSession {
  const address = target.url;
  if (address === undefined) return browserSession(target, session, new Map());
  return { ...browserSession(target, session, learnedJar(address)), learnsFrom: address };
}
