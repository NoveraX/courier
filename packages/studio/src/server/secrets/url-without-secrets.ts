import { isSecretLike } from "./is-secret-like";
import { REDACTED } from "./redacted";
import { secretName } from "./secret-name";

/*
 * Every quantifier is bounded, no two neighbours share a character, and a
 * match starts only after a character its run cannot hold: no input makes
 * these read a part of the text twice.
 */
const PARTS = /^((?:[a-z][a-z0-9+.-]{0,31}:)?\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/is;
/* A path segment this long, of a key's characters and no words, is taken for a token in the path. */
const MIN_PATH_SECRET = 20;
const WORD_PARTS = /[-.]/;
const WORD_LIKE = /^(?:[a-z]+|\d+|[0-9a-f]{1,12}|[A-Za-z0-9]{1,8})$/;
const ANCHOR = /^#[\w-]{0,128}$/;
/* A value no name gives away, cut when it reads as a token: long, of a token's characters, digits among letters. */
const TOKEN_LOOK = /^[\w.~+/=-]{24,8192}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS = /^[a-z][a-z0-9+.-]{0,31}:\/\//i;

/**
 * An address with what could be a credential cut out, and the rest as it
 * was written: no user and no password, the value of each query or
 * fragment parameter a secret's name or a token's look gives away, and
 * any path segment that reads as a token — a webhook's secret, a signed
 * link's key. `page=2`, a UUID, `report-2026-10-18.pdf` and a page's
 * `#anchor` stay.
 *
 * @param address - An absolute address, or a path with its query
 * @returns The address, its credentials cut
 * @example
 * ```ts
 * urlWithoutSecrets("https://ana:pw@api.test/v1/users?page=2&token=t0k3n#top");
 * // → "https://api.test/v1/users?page=2&token=[redacted]#top"
 * ```
 */
export function urlWithoutSecrets(address: string): string {
  const parts = PARTS.exec(address);
  if (!parts) return address;
  const [, scheme = "", authority = "", path = "", query = "", fragment = ""] = parts;
  const host = scheme ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
  return `${scheme}${host}${pathWithoutSecrets(path)}${paramsWithoutSecrets(query)}${fragmentWithoutSecrets(fragment)}`;
}

function pathWithoutSecrets(path: string): string {
  return path
    .split("/")
    .map((segment) => (isTokenSegment(segment) ? REDACTED : segment))
    .join("/");
}

/* A segment made of words, numbers or a UUID's groups is a name; a long random one is a token. */
function isTokenSegment(segment: string): boolean {
  if (!isSecretLike(segment, MIN_PATH_SECRET)) return false;
  const parts = segment.split(WORD_PARTS);
  return parts.length === 1 || !parts.every((part) => WORD_LIKE.test(part));
}

/* `?a=1&b=2`, or `#a=1&b=2`: each value cut by its name or by its look. */
function paramsWithoutSecrets(params: string): string {
  if (params.length < 2) return params;
  const cut = params
    .slice(1)
    .split("&")
    .map((param) => {
      const at = param.indexOf("=");
      if (at === -1) return looksLikeToken(decoded(param)) ? REDACTED : param;
      const strength = secretName(decoded(param.slice(0, at)));
      const value = decoded(param.slice(at + 1));
      /* In an address a weak name is a credential too: `?key=`, `?sig=`, `?session=`. */
      const secret = strength !== undefined || (!ADDRESS.test(value) && looksLikeToken(value));
      return secret && value !== "" ? `${param.slice(0, at)}=${REDACTED}` : param;
    });
  return `${params[0]}${cut.join("&")}`;
}

/* A page's anchor stays; a fragment of parameters — an OAuth answer's token — is cut as a query is. */
function fragmentWithoutSecrets(fragment: string): string {
  return fragment === "" || ANCHOR.test(fragment) ? fragment : paramsWithoutSecrets(fragment);
}

function looksLikeToken(value: string): boolean {
  return TOKEN_LOOK.test(value) && /\d/.test(value) && /[A-Za-z]/.test(value) && !UUID.test(value);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    /* A value with a stray `%` is read as it is written. */
    return text;
  }
}
