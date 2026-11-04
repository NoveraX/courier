import { REDACTED } from "./redacted";

const SYMBOL = /[+/=_~]/;
const DIGIT = /[0-9]/;
const LOWER = /[a-z]/;
const INNER_UPPER = /.[A-Z]/;
/* `createdAt`, `ConnectionRefused`: words joined in camel case, a name in code rather than a key. */
const CAMEL_WORDS = /^[A-Za-z][a-z]+(?:[A-Z][a-z]+)+$/;

/**
 * Whether a word reads as a credential rather than as prose or a name in
 * code: at least `minLength` characters, and either long, or mixing digits
 * into letters, case inside the word, or the symbols base64 and keys carry.
 * `expired`, `authentication` and `createdAt` do not; `B34rer`,
 * `dXNlcjpwYXNz` and `hunter2` do.
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
  if (DIGIT.test(word) || SYMBOL.test(word)) return true;
  return LOWER.test(word) && INNER_UPPER.test(word) && !CAMEL_WORDS.test(word);
}
