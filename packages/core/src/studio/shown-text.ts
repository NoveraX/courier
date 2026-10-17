import { REDACTED } from "./secret-words";
import { textWithoutSecrets } from "./text-secrets";
import { urlsWithoutSecrets } from "./url-secrets";

/* How much more of a text than is kept is read: what credentials are cut from shortens it. */
const READ_FACTOR = 4;
const WHITESPACE = /\s/;

/**
 * An error's text as Studio may be told it: control characters made
 * spaces, and what could be a credential cut out — in every URL its user,
 * password, query, fragment and any path segment that reads as a token; a
 * `user:password@` before a host; a header value the platform refused and
 * quoted; a JWT or a key in a known provider's format; a credential after
 * an authorization scheme; the value of a pair whose name says it is
 * secret — then cut to `maxLength` characters.
 *
 * Only the start of a long text is read, four times `maxLength`, so a text
 * of any size costs the same; a word the cut falls inside is dropped
 * rather than shown in part. The error the caller receives keeps its
 * text: only what Studio is told is cut.
 *
 * @param text - The error's text
 * @param maxLength - The longest text kept; longer text ends with "…"
 * @returns The text, safe to show
 * @example
 * ```ts
 * shownText('Headers.append: "Bearer abc" is an invalid header value.');
 * // → 'Headers.append: "[redacted]" is an invalid header value.'
 * ```
 */
export function shownText(text: string, maxLength = 2000): string {
  const shown = textWithoutSecrets(urlsWithoutSecrets(printable(readable(text, maxLength))));
  const trimmed = shown.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

/* The start of a long text, ending where a word ends: half a token is still a token. */
function readable(text: string, maxLength: number): string {
  const limit = maxLength * READ_FACTOR;
  if (text.length <= limit) return text;
  let end = limit;
  while (end > 0 && !WHITESPACE.test(text.charAt(end))) end -= 1;
  return end > 0 ? text.slice(0, end) : REDACTED;
}

/* A line break or another control character would break the line Studio shows the text on. */
function printable(text: string): string {
  let shown = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    shown += code < 0x20 || code === 0x7f ? " " : character;
  }
  return shown;
}
