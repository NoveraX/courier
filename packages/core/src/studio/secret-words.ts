/** What a value that could be a credential is replaced with. */
export const REDACTED = "[redacted]";

/* The words of a name that say its value is a credential: `x-api-key`, `accessToken`, `client_secret`. */
const SECRET_WORDS: ReadonlySet<string> = new Set([
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "pass",
  "passphrase",
  "key",
  "apikey",
  "auth",
  "authorization",
  "credential",
  "credentials",
  "cookie",
  "session",
  "sessionid",
  "sid",
  "signature",
  "sig",
  "jwt",
  "bearer",
  "otp",
]);

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const NOT_ALPHANUMERIC = /[^a-z0-9]+/;
const SYMBOL = /[+/=_~]/;
const DIGIT = /[0-9]/;
const LOWER = /[a-z]/;
const INNER_UPPER = /.[A-Z]/;

/**
 * Whether a name says its value is a credential: one of its words — split
 * at punctuation and at camel case — or the whole name run together is
 * `token`, `secret`, `password`, `key`, `auth` and the like.
 *
 * @param name - The name of a pair, a field or a header
 * @returns `true` when its value should not be shown
 * @example
 * ```ts
 * isSecretName("x-api-key"); // → true
 * isSecretName("tokens"); // → false
 * ```
 */
export function isSecretName(name: string): boolean {
  const lower = name.replace(CAMEL_BOUNDARY, "$1 $2").toLowerCase();
  if (lower.split(NOT_ALPHANUMERIC).some((word) => SECRET_WORDS.has(word))) return true;
  return SECRET_WORDS.has(lower.replace(/[^a-z0-9]/g, ""));
}

/**
 * Whether a word reads as a credential rather than as prose: at least
 * `minLength` characters, and either long, or mixing digits into letters,
 * case inside the word, or the symbols base64 and keys carry. `expired`,
 * `missing` and `authentication` do not; `B34rer`, `dXNlcjpwYXNz` and
 * `hunter2` do.
 *
 * @param word - A word with no space in it
 * @param minLength - The shortest word taken for a credential
 * @returns `true` when the word should not be shown
 * @example
 * ```ts
 * isSecretLike("expired"); // → false
 * isSecretLike("eyJhbGciOi"); // → true
 * ```
 */
export function isSecretLike(word: string, minLength = 6): boolean {
  if (word.length < minLength || word === REDACTED) return false;
  if (word.length >= 24) return true;
  if (DIGIT.test(word)) return true;
  if (SYMBOL.test(word)) return true;
  return LOWER.test(word) && INNER_UPPER.test(word);
}
