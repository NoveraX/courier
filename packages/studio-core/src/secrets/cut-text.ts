import { sliceWhole } from "../lib/slice-whole";
import { REDACTED } from "./redacted";
import { textWithoutSecrets } from "./text-without-secrets";
import { urlsWithoutSecrets } from "./urls-without-secrets";

/* How much more of a text than is kept is read: what credentials are cut from shortens it. */
const READ_FACTOR = 4;
const WHITESPACE = /\s/;

/**
 * An error's text as it leaves the page that holds Studio's token — for
 * Studio's database, an export, an agent, a page without the token — with
 * what could be a credential cut out: in every address its user, password,
 * secret parameters and any path segment that reads as a token; a private
 * key; a header value the platform refused and quoted; a JWT or a key in a
 * known provider's format; a credential after an authorization scheme;
 * the value of a pair whose name says it is secret. Line breaks stay;
 * other control characters become spaces. The text is then cut to
 * `maxLength` characters.
 *
 * Only the start of a long text is read, four times `maxLength`, so a text
 * of any size costs the same; a word the cut falls inside is dropped
 * rather than shown in part. The page with the token is shown the text
 * whole.
 *
 * @param text - The error's text
 * @param maxLength - The longest text kept; longer text ends with "…"
 * @returns The text, its credentials cut
 * @example
 * ```ts
 * cutText('Headers.append: "Bearer abc" is an invalid header value.');
 * // → 'Headers.append: "[redacted]" is an invalid header value.'
 * ```
 */
export function cutText(text: string, maxLength = 2000): string {
  const cut = textWithoutSecrets(urlsWithoutSecrets(printable(readable(text, maxLength))));
  const trimmed = cut.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${sliceWhole(trimmed, maxLength - 1)}…`;
}

/* The start of a long text, ending where a word ends: half a token is still a token. */
function readable(text: string, maxLength: number): string {
  const limit = maxLength * READ_FACTOR;
  if (text.length <= limit) return text;
  let end = limit;
  while (end > 0 && !WHITESPACE.test(text.charAt(end))) end -= 1;
  return end > 0 ? text.slice(0, end) : REDACTED;
}

/* A line break and a tab are text; any other control character could only garble the line it lands on. */
function printable(text: string): string {
  let shown = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    const control = (code < 0x20 && character !== "\n" && character !== "\t") || code === 0x7f;
    shown += control ? " " : character;
  }
  return shown;
}
