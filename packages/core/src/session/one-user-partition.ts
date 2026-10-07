import type { SessionCredentials } from "./session-credentials";

/* Writes made with a session since this runtime started: a sign-in, a sign-out, anything that may change whose it is. */
let writes = 0;

/**
 * Note a write made with the session in a runtime that serves one user —
 * as it starts, and again once it is answered. The partition the user's
 * reads are cached in is renewed each time, so an answer kept before the
 * write, or while it was under way, is not served after it: it may belong
 * to the user the write signed out.
 *
 * @example
 * ```ts
 * if (target.unsafeMethod) renewSessionPartition();
 * ```
 */
export function renewSessionPartition(): void {
  writes += 1;
}

/**
 * What tells one user's calls apart in a browser or an app, where the
 * platform sends the session's cookies out of a script's reach: the
 * credentials a script can read — a session cookie not set `HttpOnly`, a
 * bearer token, the double-submit token, which an API renews with the
 * session — and the writes made with the session so far. A cache digests it.
 *
 * @param credentials - What the call reads of the session
 * @returns The partition's material
 * @example
 * ```ts
 * sessionPartition(sessionCredentials(cookieJarOf(document.cookie), session));
 * ```
 */
export function sessionPartition(credentials: SessionCredentials): string {
  return [
    `writes:${writes}`,
    credentials.cookie ?? "",
    credentials.bearer ?? "",
    credentials.csrf ?? "",
  ].join("\u0000");
}
