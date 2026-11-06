import { assertNoCookieHeaders } from "./assert-no-cookie-headers";

/**
 * Check, where a server takes an API up, what its session means beside
 * its header lists: that no list of the API's, nor of its endpoints',
 * carries cookies past the session. What each option is comes first, so
 * each list is a list of names here, as the check read it.
 *
 * @param session - The API's session, as the check read it
 * @param lists - The header list of the API and of each endpoint, by what it belongs to
 * @throws ConfigurationError `SESSION_HEADER_CONFLICT` when one carries cookies past the session
 * @example
 * ```ts
 * assertSessionApi({ cookies: ["sid"] }, [["api", ["x-total-count"]], ["api.users.me", undefined]]);
 * ```
 */
export function assertSessionApi(
  session: unknown,
  lists: ReadonlyArray<readonly [string, readonly string[] | undefined]>,
): void {
  if (session === undefined) return;
  for (const [where, list] of lists) assertNoCookieHeaders(list, where);
}
