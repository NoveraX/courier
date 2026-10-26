import { REDACTED } from "./redacted";

/*
 * What fetch says, quoting the address as it was given, when it refuses an
 * address with credentials or cannot parse one. The address runs to the
 * end of the line, quotes, spaces and brackets inside it and all; as long
 * as any text read, 8192 characters, bounds it.
 */
const REFUSED = "Request cannot be constructed from a URL that includes credentials: ";
const UNPARSED = "Failed to parse URL from ";
const QUOTED_ADDRESS = new RegExp(`(${REFUSED}|${UNPARSED})([^\\n\\r]{1,8192})`, "g");
/* An input with a host in it: a scheme, `//`, or a user before the first `/`. */
const NAMES_A_HOST = /^(?:[a-z][a-z0-9+.-]{0,31}:|[/\\]{2}|[^/?#]{0,8192}@)/i;

/* A scheme starts where no scheme's character precedes it, so no address is read twice. */
const SCHEME = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]{0,31}:\/\//gi;
/* Where an address's host ends, as a URL parser reads it: its path, query or fragment, or the line's end. */
const AUTHORITY_END = /[\n\r/?#]/;
const AUTHORITY_LENGTH = 8192;
/* The characters a word-by-word reading of an address stops at. */
const SPLIT = /[\s"'`<>()]/;
/* `api.example.com`, `localhost:3000`, `[::1]:3000`: a host and a port, where an address with no path ends. */
const HOST_AND_PORT = /^(?:\[[^\]@]*\]|[^:@]*)(?::\d{1,5})?$/;

/**
 * A text with the credentials cut from each address in it that no single
 * word holds, which a reading word by word would cut in part: the address
 * fetch quotes, to the end of its line, as it refuses one with credentials
 * or cannot parse one — told as its scheme, host and port, or cut whole
 * when it reads as no address, and kept when it is a path with no host;
 * and a user and password that a quote, a space or a bracket splits,
 * which run, as a URL parser reads them, to the last `@` before the
 * address's path, query or fragment, or the end of its line. An address
 * whose first word is a host and a port ends there: `api.test:8443 failed
 * for ana@example.test` names no user.
 *
 * @param text - The text
 * @returns The text with those addresses' credentials cut
 * @example
 * ```ts
 * splitUrlsWithoutSecrets("connect to postgres://app:pa55 w0rd@db.internal:5432/app failed");
 * // → "connect to postgres://db.internal:5432/app failed"
 * ```
 */
export function splitUrlsWithoutSecrets(text: string): string {
  return withoutSplitUserinfo(text.replace(QUOTED_ADDRESS, quotedAddressShown));
}

function quotedAddressShown(_match: string, said: string, input: string): string {
  const address = input.trimEnd();
  const after = input.slice(address.length);
  const origin = originOf(address);
  if (origin !== undefined) return `${said}${origin}${after}`;
  /* A path with no host, `/api/users`, holds no user nor password: the rules for a query still read it. */
  if (said === UNPARSED && !NAMES_A_HOST.test(address)) return `${said}${input}`;
  return `${said}${REDACTED}${after}`;
}

function originOf(address: string): string | undefined {
  if (!URL.canParse(address)) return undefined;
  const { protocol, host } = new URL(address);
  return host === "" ? undefined : `${protocol}//${host}`;
}

function withoutSplitUserinfo(text: string): string {
  let shown = "";
  let copied = 0;
  for (const scheme of text.matchAll(SCHEME)) {
    const start = scheme.index + scheme[0].length;
    const span = authorityOf(text, start);
    const at = span.lastIndexOf("@");
    if (at === -1 || !isSplitUserinfo(span.slice(0, at))) continue;
    shown += text.slice(copied, start);
    copied = start + at + 1;
  }
  return copied === 0 ? text : shown + text.slice(copied);
}

function authorityOf(text: string, start: number): string {
  const span = text.slice(start, start + AUTHORITY_LENGTH);
  const end = span.search(AUTHORITY_END);
  return end === -1 ? span : span.slice(0, end);
}

/* A user and password a word-by-word reading would cut in part: split, and not a host's name and port. */
function isSplitUserinfo(userinfo: string): boolean {
  const split = userinfo.search(SPLIT);
  return split !== -1 && !HOST_AND_PORT.test(userinfo.slice(0, split));
}
