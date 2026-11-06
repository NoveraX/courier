/**
 * A message the project's code wrote, quoted with the values of the
 * environment masked: a module that throws `new Error("bad DATABASE_URL " +
 * url)` must not put the address into a CI log, which may be public. What
 * the environment does not hold — a bearer token, a password in an
 * address, a `token=` pair — is then cut as the core's `redact()` cuts it,
 * with the one sign it writes, `[redacted]`.
 *
 * A value is found as the variable holds it, and in the forms code writes
 * it in: escaped in JSON, encoded for an address, trimmed, and each line of
 * a value of several, such as a key in PEM. A value, or one of its forms, is
 * masked where it is 8 characters long or more; a shorter one — `true`, a
 * port — would mask words of the message itself and is rarely a secret. A
 * value the code changed some other way — cut, encoded otherwise — is not
 * found. The values of the variables a system sets for every process —
 * paths, the user's name, the locale — are left alone: they are no secret,
 * and masking `HOME` would take the path out of every file a message names.
 */

import { inspect } from "node:util";

import { redact } from "@noverax/courier";
import { REDACTED } from "@noverax/courier/internal";

/** The shortest value masked. */
const MIN_MASKED_LENGTH = 8;

/** Variables every process has whose values are paths and settings, never secrets. */
const SYSTEM_VARIABLES = new Set([
  "PATH",
  "HOME",
  "PWD",
  "OLDPWD",
  "INIT_CWD",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "USER",
  "USERNAME",
  "LOGNAME",
  "HOSTNAME",
  "LANG",
  "LANGUAGE",
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "COLORTERM",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "NODE",
  "NODE_ENV",
  "CI",
  "COURIER_PHASE",
]);
const SYSTEM_PREFIXES = ["LC_", "XDG_", "npm_config_", "npm_package_", "npm_lifecycle_"];

/**
 * The text with every value of the environment that could be a secret,
 * and every form of it above, replaced by `[redacted]`, the longest first,
 * so a value that holds another is masked whole.
 *
 * @param text - The message, as the project's code wrote it
 * @param env - The environment whose values are masked
 * @returns The message, masked
 * @example
 * ```ts
 * maskEnvironmentValues("cannot reach postgres://u:p@db/app", { DATABASE_URL: "postgres://u:p@db/app" });
 * // → "cannot reach [redacted]"
 * ```
 */
export function maskEnvironmentValues(
  text: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < MIN_MASKED_LENGTH || isSystem(name)) continue;
    for (const form of formsOf(value)) if (form.length >= MIN_MASKED_LENGTH) values.add(form);
  }
  let masked = text;
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    masked = masked.split(value).join(REDACTED);
  }
  return masked;
}

/**
 * The text with no secret left to quote: the environment's values masked,
 * then every credential `redact()` finds cut.
 *
 * @param text - The message, as the project's code wrote it
 * @param env - The environment whose values are masked
 * @returns The message, with the one sign in place of each secret
 * @example
 * ```ts
 * withoutSecrets("refused Bearer t0k3n", {}); // → "refused Bearer [redacted]"
 * ```
 */
export function withoutSecrets(
  text: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return redact(maskEnvironmentValues(text, env));
}

function isSystem(name: string): boolean {
  return SYSTEM_VARIABLES.has(name) || SYSTEM_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/* A value, and the forms code writes it in: escaped in JSON, encoded for an address, trimmed, and
   each line of a value of several, trimmed too. */
function formsOf(value: string): string[] {
  const lines = value.split(/\r?\n/);
  return [
    value,
    JSON.stringify(value).slice(1, -1),
    encodeURIComponent(value),
    value.trim(),
    ...(lines.length > 1 ? lines.map((line) => line.trim()) : []),
  ];
}

/**
 * What the project's code threw, as an error whose message and stack hold
 * no value of the environment: the error a load error carries as its
 * `cause`, so no log that prints it — at debug level, by a bundler — can
 * hold one either; then what `redact()` cuts of a credential the
 * environment does not hold. It keeps the thrown error's name and `code`;
 * a value thrown that is no error becomes one, its text masked.
 *
 * @param thrown - What the code threw
 * @param env - The environment whose values are masked
 * @returns The error, masked
 * @example
 * ```ts
 * maskedError(new TypeError(`bad ${process.env.API_KEY}`)).message; // "bad [redacted]"
 * ```
 */
export function maskedError(
  thrown: unknown,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Error {
  if (!(thrown instanceof Error))
    return redact(new Error(withoutSecrets(describedValue(thrown), env)));
  const masked = new Error(maskEnvironmentValues(thrown.message, env));
  masked.name = thrown.name;
  masked.stack =
    thrown.stack === undefined
      ? `${masked.name}: ${masked.message}`
      : maskEnvironmentValues(thrown.stack, env);
  const code: unknown = Reflect.get(thrown, "code");
  if (typeof code === "string")
    Object.defineProperty(masked, "code", { value: code, enumerable: true });
  return redact(masked);
}

/**
 * A value thrown that is no error, as text: a string as it is, anything else
 * as Node's inspector writes it — `[Object: null prototype] {}` — since a
 * value with no string form of its own would throw again when made one.
 *
 * @param value - What was thrown
 * @returns Its text
 * @example
 * ```ts
 * describedValue(Object.create(null)); // "[Object: null prototype] {}"
 * ```
 */
export function describedValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : inspect(value, { depth: 2, breakLength: Number.POSITIVE_INFINITY });
}
