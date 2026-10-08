/* Headers that carry a credential by their name alone. */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

/* A word of the name, between dashes or underscores: `x-api-key`, `x-auth-token`,
   `x_session_id` — and the double-submit tokens written as one word, Django's
   `X-CSRFToken`, Angular's `X-XSRF-TOKEN`, that an API's session repeats. */
const CREDENTIAL_WORDS =
  /(?:^|[-_])(?:auth|token|secret|password|passwd|session|csrf[a-z]*|xsrf[a-z]*|api[-_]?key|apikey)(?:$|[-_])/i;

/**
 * Whether a header's value is a credential — the user's cookies, a token,
 * an API key — that a log, a stored request or a printed error must not
 * show.
 *
 * @param name - The header's name, in any case
 * @returns Whether its value is kept out of sight
 * @example
 * ```ts
 * isCredentialHeader("Set-Cookie"); // true
 * isCredentialHeader("x-csrftoken"); // true
 * isCredentialHeader("content-type"); // false
 * ```
 */
export function isCredentialHeader(name: string): boolean {
  return CREDENTIAL_HEADERS.has(name.toLowerCase()) || CREDENTIAL_WORDS.test(name);
}
