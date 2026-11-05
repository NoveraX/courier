import { ConfigurationError } from "../errors/configuration-error";

/* What a value may hold once its ends are trimmed, as fetch's dispatcher holds it to when it
   sends: a tab, the printable characters and the bytes past 127 — no other control character,
   NUL and the line breaks among them, and, a header being bytes, no character past U+00FF. */
const UNSENDABLE = /[^\t\x20-\x7e\x80-\xff]/;

/* A value without the tabs, spaces and line breaks at its ends, all fetch trims: `trim()` takes
   more — a no-break space, a vertical tab — and would let pass a line break fetch keeps inside.
   Anchored at the start alone, it reads the value once: one anchored at the end too would take
   time growing with the square of a run of spaces inside, which a proxied request can carry. */
const WITHOUT_ENDS = /^[\t\n\r ]*(.*[^\t\n\r ])?/s;

/**
 * A header value as `fetch` sends it — without the tabs, spaces and line
 * breaks at its ends — refused before the platform refuses it if `fetch`
 * could not send it: a control character other than a tab, a line break
 * inside it among them, or a character past U+00FF. `Headers` takes some
 * control characters that the dispatcher sending the request then refuses,
 * a failure no retry mends; and the platform's refusal can repeat the value
 * whole, where a header's value is often a credential. This one names the
 * header and never the value, before anything is sent.
 *
 * @param name - The header's name
 * @param value - Its value
 * @param said - What the value is, for the message (default: the header's value)
 * @returns The value as `fetch` sends it
 * @throws {ConfigurationError} `HEADER_VALUE_INVALID`, when the value cannot be sent
 * @example
 * ```ts
 * sendableValue("authorization", `Bearer ${token}\n`, "The token getToken returned"); // "Bearer …"
 * ```
 */
export function sendableValue(name: string, value: string, said?: string): string {
  const sent = WITHOUT_ENDS.exec(value)?.[1] ?? "";
  if (!UNSENDABLE.test(sent)) return sent;
  throw new ConfigurationError(
    "HEADER_VALUE_INVALID",
    `${said ?? `The "${name}" header's value`} holds a control character other than a tab, or one past U+00FF; the value is not shown.`,
  );
}

/**
 * The headers a request is sent with, from any form they are given in — a
 * record, its unset entries left out, pairs, or a `Headers` — and the one
 * place a call's headers are put together for sending: a direct call's, a
 * proxy client's, one the proxy serves in this process, the fetch
 * client's. Each value is checked as it is added, and added as `fetch`
 * sends it, so one no request can carry is refused here by the header's
 * name, before the platform refuses it repeating the value. A `Headers`
 * holds values the platform checked as they were set, and is copied as it
 * is.
 *
 * @param input - The headers, as a call, an API, a caller or a middleware gave them
 * @returns A new `Headers` for the request
 * @throws {ConfigurationError} `HEADER_VALUE_INVALID`, for a value no request can carry
 * @example
 * ```ts
 * const headers = sendableHeaders({ "x-api-key": key, accept: undefined }); // x-api-key alone
 * ```
 */
export function sendableHeaders(input: unknown): Headers {
  if (input instanceof Headers) return new Headers(input);
  const headers = new Headers();
  for (const [name, value] of entriesOf(input)) {
    if (value !== undefined) headers.append(name, sendableValue(name, String(value)));
  }
  return headers;
}

/* A record's own entries — Node's conversion of a whole record drops a key `__proto__` — or a list's pairs. */
function entriesOf(input: unknown): Array<readonly [string, unknown]> {
  if (typeof input !== "object" || input === null) return [];
  if (!isIterable(input)) return Object.entries(input);
  const pairs: Array<readonly [string, unknown]> = [];
  for (const entry of input) {
    if (!Array.isArray(entry)) continue;
    const [name, value]: unknown[] = entry;
    if (typeof name === "string") pairs.push([name, value]);
  }
  return pairs;
}

function isIterable(value: object): value is Iterable<unknown> {
  return Symbol.iterator in value;
}
