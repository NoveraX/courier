/*
 * The same rule Studio's server keeps credentials out of what it writes
 * down by (`src/server/storage/without-credentials.ts`); a test holds the
 * two to one answer.
 */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

/* A word of the name, between dashes or underscores: `x-api-key`, `x-auth-token`, `x_session_id`. */
const CREDENTIAL_WORDS =
  /(?:^|[-_])(?:auth|token|secret|password|passwd|session|csrf|xsrf|api[-_]?key|apikey)(?:$|[-_])/i;

/**
 * Whether a header carries a credential, whose value the inspector hides
 * until asked and a snippet leaves out.
 *
 * @param name - The header's name, in any case
 * @returns Whether it carries a credential
 * @example
 * ```ts
 * isCredentialHeader("X-Api-Key"); // true
 * ```
 */
export function isCredentialHeader(name: string): boolean {
  return CREDENTIAL_HEADERS.has(name.toLowerCase()) || CREDENTIAL_WORDS.test(name);
}
