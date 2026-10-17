import { isSecretLike, REDACTED } from "./secret-words";

/*
 * Every quantifier is bounded, no two neighbours share a character, and a
 * match starts only after a character its run cannot hold: no input makes
 * these read a part of the text twice.
 */
const URL_IN_TEXT = /(^|[^a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>()]{1,2048})/gi;
const USERINFO = /^([a-z][a-z0-9+.-]{0,31}:\/\/)[^/?#@]{0,256}@/i;
const QUERY_OR_FRAGMENT = /[?#]/;
/* `user:password@host` written without a scheme, after a space, a quote or a bracket. */
const BARE_USERINFO = /(^|[\s"'(<,;=])[^\s@:/"'<>]{1,64}:[^\s@/"'<>]{1,128}@(?=[A-Za-z0-9.[-])/g;
/* A path segment this long, and of a key's characters, is taken for a token in the path. */
const MIN_PATH_SECRET = 20;

/**
 * A text with every URL in it cut to what it addresses: no user, no
 * password, no query, no fragment, and no path segment that reads as a
 * token — a webhook's secret, a signed link's key. A `user:password@`
 * written before a host without a scheme is cut too.
 *
 * @param text - The text, already cut to a bounded length
 * @returns The text with its URLs cut
 * @example
 * ```ts
 * urlsWithoutSecrets("GET https://ana:pw@api.test/v1?sig=abc failed");
 * // → "GET https://api.test/v1 failed"
 * ```
 */
export function urlsWithoutSecrets(text: string): string {
  return text
    .replace(URL_IN_TEXT, (_match, before: string, address: string) => before + shownUrl(address))
    .replace(BARE_USERINFO, `$1${REDACTED}@`);
}

function shownUrl(address: string): string {
  try {
    const url = new URL(address);
    return `${url.protocol}//${url.host}${shownPath(url.pathname)}`;
  } catch {
    /* Not a URL the parser reads: cut by hand what could carry a secret. */
    const kept = address.replace(USERINFO, "$1");
    const end = kept.search(QUERY_OR_FRAGMENT);
    return end === -1 ? kept : kept.slice(0, end);
  }
}

function shownPath(path: string): string {
  return path
    .split("/")
    .map((segment) => (isSecretLike(segment, MIN_PATH_SECRET) ? REDACTED : segment))
    .join("/");
}
