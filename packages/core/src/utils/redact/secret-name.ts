import { isSecretLike } from "./is-secret-like";

/* A name whose last word is one of these holds a credential whatever its value reads like. A
   one-time password is a few digits, often a number, which no look tells from a count; a
   session's id, `sid`, and a signature, `sig`, are what `sessionid` and `signature` hold; `auth`
   and `session` name a credential in a header's name too. */
const STRONG_WORDS: ReadonlySet<string> = new Set([
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "pass",
  "passphrase",
  "apikey",
  "authorization",
  "credential",
  "credentials",
  "cookie",
  "jwt",
  "bearer",
  "otp",
  "sid",
  "sig",
  "session",
  "auth",
]);

/* This names a credential only when the value reads as one: `key=id` is a column, `key=Zq9x7Kp2` is not. */
const WEAK_WORDS: ReadonlySet<string> = new Set(["key"]);
const WHITESPACE = /\s/;

/* A name run together that ends as a credential's does: `accesstoken`, `JSESSIONID`, `clientsecret`. */
const RUN_TOGETHER =
  /(?:token|secret|password|passwd|passphrase|sessid|sessionid|credentials?|apikey|accesskey|privatekey|secretkey|signature)$|^(?:csrf|xsrf)$/;
/* A version or a number after the name says nothing of it: `X-Hub-Signature-256`. */
const NUMBER = /^\d+$/;

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const NOT_ALPHANUMERIC = /[^a-z0-9]+/;

/** How sure a name is that its value is a credential. */
export type SecretName = "strong" | "weak";

/**
 * Whether a name says its value is a credential, read by its last word —
 * split at punctuation and at camel case — or the whole name run together:
 * `x-api-key`, `accessToken`, `client_secret`, `JSESSIONID`, `otp` do,
 * `keyFile`, `tokenUrl` and `secretName` do not. A strong name holds a
 * credential whatever its value; `key`, the one weak name, only when the
 * value reads as one.
 *
 * @param name - The name of a pair, a field or a header
 * @returns `strong`, `weak`, or `undefined` for a name that holds none
 * @example
 * ```ts
 * secretName("x-api-key"); // → "strong"
 * secretName("sort key"); // → "weak"
 * secretName("keyFile"); // → undefined
 * ```
 */
export function secretName(name: string): SecretName | undefined {
  const words = name
    .replace(CAMEL_BOUNDARY, "$1 $2")
    .toLowerCase()
    .split(NOT_ALPHANUMERIC)
    .filter((word) => word !== "" && !NUMBER.test(word));
  const [last = "", before = ""] = [...words].reverse();
  if (STRONG_WORDS.has(last) || (last === "key" && (before === "api" || before === "secret"))) {
    return "strong";
  }
  if (RUN_TOGETHER.test(words.join(""))) return "strong";
  return WEAK_WORDS.has(last) ? "weak" : undefined;
}

/**
 * Whether a value given under a name is kept out of sight, read alike
 * wherever the two stand — a parameter of an address, a record's field, a
 * pair in a text, a header — so a record never holds one value hidden in
 * one place and shown in another: under a strong name whatever was given
 * but nothing; under a weak one a word that reads as a credential, a number
 * as the digits it is written in.
 *
 * @param name - The name of the parameter, the field, the pair or the header
 * @param value - Its value, as given or as written
 * @returns `true` when the value is not to be shown
 * @example
 * ```ts
 * isSecretValue("sig", "made-up"); // → true
 * isSecretValue("key", "id"); // → false
 * isSecretValue("key", 123456); // → true
 * ```
 */
export function isSecretValue(name: string, value: unknown): boolean {
  const strength = secretName(name);
  if (strength === "strong") return value !== undefined && value !== null && value !== "";
  const written = typeof value === "number" ? String(value) : value;
  return (
    strength === "weak" &&
    typeof written === "string" &&
    !WHITESPACE.test(written) &&
    isSecretLike(written)
  );
}
