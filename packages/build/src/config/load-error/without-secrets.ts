/**
 * A message the project's code wrote, as it leaves the process — for a CI
 * log, which may be public, or a page — with no secret left in it: every
 * value of the environment masked, where `valueSpans` finds one, and every
 * credential the core's `redact()` finds cut — a bearer token, a password
 * in an address, a `token=` pair — each with the one sign, `[redacted]`.
 *
 * Each is found in the text as the code wrote it, so neither reads what the
 * other left. Masking a value first breaks what a credential is found by: a
 * runner's `PGUSER=postgres` masked in `postgres://app:hunter2@db/shop`
 * leaves no address to cut the password from. Cutting first leaves a value
 * whose part a credential's rule cut — the host of `DATABASE_URL`, the last
 * words of a passphrase — where no mask finds it whole.
 *
 * So the text is cut as it is, then cut again for each stretch a value
 * stands in, with that stretch written over and every character of it
 * changed: what the two cuts share before and after it does not hang on the
 * value, and what lies between is masked. A value the cut kept is masked
 * whole, one it took out leaves nothing to mask, and a credential around
 * either is cut as the core cuts it. The cut reads the text as a terminal
 * shows it, without its control codes: a code's letters run into the word
 * after them, which hides a credential's scheme.
 *
 * It costs what `redact()` costs a text, times the cuts, whatever it is
 * handed: four times 8192 characters read, to a word's end and never into a
 * value, 8192 kept, and the text cut again 16 times at most.
 */

import { inspect } from "node:util";

import { cutSecrets, REDACTED, sliceWhole } from "@noverax/courier/internal";

import { type Environment, joined, type Span, valueSpans } from "./value-spans";

/** The most of a text kept, in characters, as `redact()` keeps one: past it, the text ends with "…". */
const MAX_KEPT = 8_192;
/** The most of a text read, four times what is kept, as `redact()` reads one: it ends at a word. */
const MAX_READ = 4 * MAX_KEPT;
/** The most times a text is cut again: more stretches are written over together, in as many groups. */
const MAX_RECUTS = 16;
const WHITESPACE = /\s/;
const ANY = /[\s\S]/g;
/* The character that opens a terminal's control sequences: colours, moves. */
const ESCAPE = 0x1b;
const LETTER = /[A-Za-z]/;

/**
 * The text with no secret left to quote, by the rules above.
 *
 * @param text - The message, as the project's code wrote it
 * @param env - The environment whose values are masked
 * @returns The message, with the one sign in place of each secret
 * @example
 * ```ts
 * withoutSecrets("cannot reach postgres://app:pw@db/shop", { PGUSER: "postgres" });
 * // → "cannot reach [redacted]://db/shop"
 * ```
 */
export function withoutSecrets(text: string, env: Environment = process.env): string {
  const reach = Math.min(text.length, MAX_READ);
  const spans = valueSpans(text, env, reach);
  const end = readEnd(text, spans, reach);
  const read = text.slice(0, end);
  const cut = shownCut(read);
  const within = spans.filter(([, stop]) => stop <= end);
  const said = within.length === 0 ? cut : maskedIn(cut, dependentRegions(read, cut, within));
  if (end === text.length && said.length <= MAX_KEPT) return said;
  return end === 0 ? `${REDACTED}…` : `${sliceWhole(said, MAX_KEPT - 1)}…`;
}

/* Where a long text is read to: the end of a word before `reach`, and never inside a value, half
   of which would be left for nothing to find. */
function readEnd(text: string, spans: readonly Span[], reach: number): number {
  if (reach === text.length) return reach;
  let end = reach;
  for (;;) {
    while (end > 0 && !WHITESPACE.test(text.charAt(end))) end -= 1;
    const crossed = spans.find(([start, stop]) => start < end && end < stop);
    if (crossed === undefined) return end;
    end = crossed[0];
  }
}

/* The stretches of the cut text that hang on a value: what it and the text cut with the value's
   stretch written over do not share at their start and end. */
function dependentRegions(read: string, cut: string, spans: readonly Span[]): Span[] {
  const size = Math.ceil(spans.length / MAX_RECUTS);
  const regions: Span[] = [];
  for (let at = 0; at < spans.length; at += size) {
    const region = unshared(cut, shownCut(writtenOver(read, spans.slice(at, at + size))));
    if (region[0] < region[1]) regions.push(region);
  }
  return joined(regions);
}

/* The text with each stretch written over, every character of it changed, in either case. */
function writtenOver(text: string, spans: readonly Span[]): string {
  let written = "";
  let at = 0;
  for (const [start, end] of spans) {
    const over = text
      .slice(start, end)
      .replace(ANY, (character) => (character === "x" || character === "X" ? "y" : "x"));
    written += `${text.slice(at, start)}${over}`;
    at = end;
  }
  return `${written}${text.slice(at)}`;
}

/* Where one text differs from another: past what the two start with alike, and short of what
   they end with alike. */
function unshared(text: string, other: string): Span {
  const shorter = Math.min(text.length, other.length);
  let start = 0;
  while (start < shorter && text[start] === other[start]) start += 1;
  let end = 0;
  while (end < shorter - start && text[text.length - 1 - end] === other[other.length - 1 - end]) {
    end += 1;
  }
  return [start, text.length - end];
}

/* The cut text with each stretch masked, and signs that came to stand together made one. */
function maskedIn(cut: string, regions: readonly Span[]): string {
  let said = "";
  let at = 0;
  for (const [start, end] of regions) {
    said += `${cut.slice(at, start)}${REDACTED}`;
    at = end;
  }
  const parts = `${said}${cut.slice(at)}`.split(REDACTED);
  return parts
    .filter((part, index) => part !== "" || index === 0 || index === parts.length - 1)
    .join(REDACTED);
}

/* What the core's rules leave of a text, read as a terminal shows it. */
function shownCut(text: string): string {
  return cutSecrets(withoutTerminalCodes(text));
}

/* The text without the codes a terminal reads — ESC, "[", parameters, a final letter — and with a
   space for any other control character but a line break and a tab. */
function withoutTerminalCodes(text: string): string {
  let shown = "";
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === ESCAPE && text[at + 1] === "[") {
      at += 2;
      while (at < text.length && !LETTER.test(text.charAt(at))) at += 1;
    } else {
      const control = (code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f;
      shown += control ? " " : text.charAt(at);
    }
  }
  return shown;
}

/**
 * What the project's code threw, as an error whose message and stack hold
 * no secret, by the rules above: the error a load error carries as its
 * `cause`, so no log that prints it — at debug level, by a bundler — holds
 * one either. It keeps the thrown error's name and `code`; a value thrown
 * that is no error becomes one, its text cut the same way.
 *
 * @param thrown - What the code threw
 * @param env - The environment whose values are masked
 * @returns The error, masked
 * @example
 * ```ts
 * maskedError(new TypeError(`bad ${process.env.API_KEY}`)).message; // "bad [redacted]"
 * ```
 */
export function maskedError(thrown: unknown, env: Environment = process.env): Error {
  if (!(thrown instanceof Error)) return new Error(withoutSecrets(describedValue(thrown), env));
  const masked = new Error(withoutSecrets(thrown.message, env));
  masked.name = thrown.name;
  masked.stack =
    thrown.stack === undefined
      ? `${masked.name}: ${masked.message}`
      : withoutSecrets(thrown.stack, env);
  const code: unknown = Reflect.get(thrown, "code");
  if (typeof code === "string")
    Object.defineProperty(masked, "code", { value: code, enumerable: true });
  return masked;
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
