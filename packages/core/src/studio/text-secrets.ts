import { isSecretLike, isSecretName, REDACTED } from "./secret-words";

/*
 * Every quantifier is bounded and no two neighbours share a character, and
 * a match starts only after a character its run cannot hold: no start lies
 * inside a run another start has read, so each costs the text's length.
 */

/* The platform's Headers and Node's http quote the value they refused: an Authorization header read with its line break. */
const QUOTED_HEADER_VALUE = /"[^"]{0,4096}"(?= is an invalid header (?:value|name))/g;
const VALUE_FOR_HEADER = /(Invalid value )"[^"]{0,4096}"(?= for header ")/g;
const JWT = /(^|[^\w-])eyJ[\w-]{4,1024}\.[\w-]{4,2048}\.[\w-]{0,1024}/g;
const KNOWN_KEY =
  /(^|[^\w-])(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,256}|gh[pousr]_[A-Za-z0-9]{20,256}|github_pat_\w{20,256}|xox[abprs]-[A-Za-z0-9-]{10,256}|AKIA[0-9A-Z]{16}|AIza[\w-]{35}|glpat-[\w-]{20,256}|sk-[\w-]{20,256})/g;
const AUTH_VALUE =
  /(^|[^\w-])(bearer|basic|token|digest|negotiate|ntlm|apikey|api-key)([ \t]{1,3}|[ \t]{0,3}[:=][ \t]{0,3})([\w.~+/=-]{1,1024})/gi;
const PAIR =
  /(^|[^\w.-])([A-Za-z][\w.-]{0,63})(["']?)([ \t]{0,3})([=:])([ \t]{0,3})("[^"]{0,512}"|'[^']{0,512}'|[^\s&,;"'<>(){}[\]]{1,512})/g;
const ALREADY_URL = /^[a-z][a-z0-9+.-]{0,31}:\/\//i;

/**
 * A text with what could be a credential cut out, the rest as it was: a
 * header value the platform refused and quoted, a JWT, a key in a known
 * provider's format, a word after an authorization scheme that reads as a
 * credential, and the value of a pair whose name says it is secret —
 * always after `=` or in quotes, after `:` only when it reads as one, so
 * `tokens: 3` and `Token expired` stay as they were.
 *
 * @param text - The text, already cut to a bounded length
 * @returns The text with its credentials cut
 * @example
 * ```ts
 * textWithoutSecrets("refused x-api-key=s3cret, Bearer token missing");
 * // → "refused x-api-key=[redacted], Bearer token missing"
 * ```
 */
export function textWithoutSecrets(text: string): string {
  return text
    .replace(QUOTED_HEADER_VALUE, `"${REDACTED}"`)
    .replace(VALUE_FOR_HEADER, `$1"${REDACTED}"`)
    .replace(JWT, `$1${REDACTED}`)
    .replace(KNOWN_KEY, `$1${REDACTED}`)
    .replace(AUTH_VALUE, shownAuthValue)
    .replace(PAIR, shownPair);
}

function shownAuthValue(
  match: string,
  before: string,
  scheme: string,
  between: string,
  value: string,
): string {
  return isSecretLike(value) ? `${before}${scheme}${between}${REDACTED}` : match;
}

function shownPair(
  match: string,
  before: string,
  name: string,
  quote: string,
  spaceBefore: string,
  separator: string,
  spaceAfter: string,
  value: string,
): string {
  if (!isSecretName(name) || value === REDACTED || ALREADY_URL.test(value)) return match;
  const head = `${before}${name}${quote}${spaceBefore}${separator}${spaceAfter}`;
  const opening = value[0];
  if (opening === '"' || opening === "'") {
    return value.length > 2 ? `${head}${opening}${REDACTED}${opening}` : match;
  }
  /* `name=value` is a query or a setting; after `:` the next word may be prose. */
  const assigned = separator === "=" && spaceBefore === "" && spaceAfter === "";
  return assigned || isSecretLike(value) ? `${head}${REDACTED}` : match;
}
