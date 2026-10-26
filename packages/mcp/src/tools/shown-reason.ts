import { cutText, REDACTED, splitUrlsWithoutSecrets } from "@noverax/courier-studio-core";

/* An address is shown as its scheme, host and port: its path, query and
   fragment may carry a token, its userinfo a password. A scheme is read
   from where no scheme's character precedes it, so no text is read twice. */
const ADDRESS = /(?<![a-z\d+.-])([a-z][a-z\d+.-]*):\/\/[^\s"'<>`]+/gi;
/* What closes the sentence an address ends, rather than the address. */
const CLOSERS = new Set([")", ".", ",", ";", ":", "!", "?", "]", "}"]);
/* A run of text with no space or quote in it, where a query or a fragment
   that sets a value is looked for outside a whole address: `/users?key=…`. */
const WORD = /[^\s"'<>`]+/g;
const PARAMETERS = /[?#]/;
/* undici's `Headers` quotes a header value it refuses — a token with a
   stray line break in it, say — between these two, however long it is. */
const REFUSED_VALUE_START = ': "';
const REFUSED_VALUE_END = '" is an invalid header value';
/* Node's own errors quote what they were given when an argument is wrong. */
const RECEIVED = /(\. Received ).*$/s;
const WHITESPACE = /\s+/g;

export interface ShownReasonOptions {
  /** The failure's code, told before its text unless the text names it */
  readonly code?: string | undefined;
  /** How many characters the text may run to */
  readonly limit: number;
}

/**
 * A failure's reason as an agent may be shown it: its code, then its text on
 * one line and cut short. Every address in it is cut to its scheme, host
 * and port, and a header value or an argument the platform refused is left
 * out; then whatever Studio cuts from an error's text before it leaves its
 * page — a token after an authorization scheme, a `password=`, a private
 * key, a JWT, a provider's key — is cut the same way, so an agent is never
 * told more than Studio keeps. Each step reads the text once, so a long
 * one an upstream put in an error costs no more than its length.
 *
 * @param text - What the failure says
 * @param options - Its code, and how long the text may be
 * @returns The line
 * @example
 * ```ts
 * shownReason("Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)", {
 *   code: "UND_ERR_CONNECT_TIMEOUT",
 *   limit: 300,
 * });
 * // "UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)"
 * shownReason("No answer from https://ada:pw@api.example.com/v1/users?key=k: password=hunter2", { limit: 300 });
 * // "No answer from https://api.example.com: password=[redacted]"
 * ```
 */
export function shownReason(text: string, { code, limit }: ShownReasonOptions): string {
  const shown = cutText(cutForAgent(text, code), limit);
  if (shown === "") return code ?? "";
  return code === undefined || shown.includes(code) ? shown : `${code}: ${shown}`;
}

/* What an agent is told keeps less than Studio's own page does: no argument
   or header value the platform refused, and an address only as its origin.
   An address no single word holds loses its user and password first, line
   by line, so no part of a password a quote or a space splits is left
   beside the origin. */
function cutForAgent(text: string, code: string | undefined): string {
  const told = code?.startsWith("ERR_") ? text.replace(RECEIVED, `$1${REDACTED}`) : text;
  return splitUrlsWithoutSecrets(withoutRefusedValue(told))
    .replace(WHITESPACE, " ")
    .trim()
    .replace(ADDRESS, originOf)
    .replace(WORD, withoutParameters);
}

function withoutRefusedValue(text: string): string {
  const end = text.lastIndexOf(REFUSED_VALUE_END);
  const start = end === -1 ? -1 : text.indexOf(REFUSED_VALUE_START);
  if (start === -1 || start >= end) return text;
  return `${text.slice(0, start + REFUSED_VALUE_START.length)}${REDACTED}${text.slice(end)}`;
}

function originOf(address: string, scheme: string): string {
  let end = address.length;
  while (end > 0 && CLOSERS.has(address.charAt(end - 1))) end--;
  const bare = address.slice(0, end);
  const closing = address.slice(end);
  if (!URL.canParse(bare)) return `${scheme}://${REDACTED}${closing}`;
  const { protocol, host } = new URL(bare);
  return `${protocol}//${host}${closing}`;
}

function withoutParameters(word: string): string {
  const start = word.search(PARAMETERS);
  return start !== -1 && word.includes("=", start)
    ? `${word.slice(0, start + 1)}${REDACTED}`
    : word;
}
