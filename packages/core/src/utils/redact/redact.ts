import { headersWithoutSecrets } from "./headers";
import { redactedValue } from "./redacted-value";
import { attempt, FAILED, UNREADABLE } from "./unreadable";

/**
 * A value with what could be a credential cut out, for whatever leaves the
 * process that holds it: a log line, a printed error, a record kept or
 * sent elsewhere. One function, so every path cuts by the same rules.
 *
 * - A text loses a private key, a JWT, a key in a known provider's format,
 *   the value after an authorization scheme, the value of a pair whose name
 *   says it is secret, a header value the platform quoted as it refused it,
 *   and in every address its user, password, secret parameters and any path
 *   segment that reads as a token. Other control characters than a line
 *   break and a tab become spaces, and a text past 8,192 characters is cut
 *   short where a word ends.
 * - `Headers` are read by name: a credential header's value is hidden — an
 *   `Authorization` keeps its scheme, a `Set-Cookie` its name and attributes.
 * - An error is read as a copy that prints as it does: its name, its
 *   message and the message its stack starts with cut, the stack's frames
 *   kept, its own fields and its chain of causes read in turn.
 * - A list and a record are read entry by entry, an entry whose name says it
 *   is secret hidden whole; any other object is shown by its kind alone.
 *
 * Deeper than sixteen levels, or where a value holds itself, `[…]` stands in
 * its place; past a thousand entries a list or a record is cut short. A
 * value that held nothing to cut comes back as it was — the same error, the
 * same record — so a log prints an error that carries no credential as the
 * error it is; the value given is never changed.
 *
 * @param value - What to redact
 * @returns The value, or a copy with every credential cut; `Headers` always as a record
 * @example
 * ```ts
 * redact('Headers.set: "Bearer t0k3n\r\nX-Injected: 1" is an invalid header value.');
 * // → 'Headers.set: "[redacted]" is an invalid header value.'
 * redact(new Headers({ authorization: "Bearer t0k3n" })); // → { authorization: "Bearer [redacted]" }
 * redact({ user: "ana", password: "hunter2" }); // → { user: "ana", password: "[redacted]" }
 * ```
 */
export function redact(value: string): string;
export function redact(value: Headers): Record<string, string | string[]>;
export function redact(value: Error): Error;
export function redact(value: unknown): unknown;
export function redact(value: unknown): unknown {
  const shown = attempt(() =>
    value instanceof Headers ? headersWithoutSecrets(value) : redactedValue(value, 0, new Set()),
  );
  return shown === FAILED ? UNREADABLE : shown;
}
