import { isCredentialHeader } from "@noverax/courier/internal";

import { isSecretLike } from "./is-secret-like";
import { REDACTED } from "./redacted";
import { type SecretName, secretName } from "./secret-name";
import { TEXT_PATTERNS as P } from "./text-patterns";

/**
 * A text with what could be a credential cut out, the rest as it was: a
 * private key, a header value the platform refused and quoted, a JWT, a
 * key in a known provider's format, the value after `Authorization:`, a
 * word after an authorization scheme that reads as one, a Digest proof,
 * the values of a key Postgres refused for a secret column, the value of a
 * pair whose name says it is secret, a credential header's value written
 * after a space, and — where the text speaks of signing in — a
 * `user:password`. A strong name — `password`, `token`, `api_key` — is cut
 * after `=` or in quotes whatever its value; a weak one — `key`,
 * `session` — only when the value reads as a credential, so `key=id`,
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
  const cut = text
    .replace(P.PEM, REDACTED)
    .replace(P.APPENDED_HEADER, `$1"${REDACTED}"`)
    .replace(P.QUOTED_HEADER_VALUE, `"${REDACTED}"`)
    .replace(P.VALUE_FOR_HEADER, `$1"${REDACTED}"`)
    .replace(P.JWT, `$1${REDACTED}`)
    .replace(P.KNOWN_KEY, `$1${REDACTED}`)
    .replace(P.AUTHORIZATION_VALUE, cutAuthorization)
    .replace(P.AUTH_VALUE, cutAuthValue)
    .replace(P.DIGEST_RESPONSE, `$1"${REDACTED}"`)
    .replace(P.POSTGRES_KEY, cutPostgresKey)
    .replace(P.PAIR, cutPair)
    .replace(P.SPACED, cutSpaced);
  return P.AUTH_CONTEXT.test(cut) ? cut.replace(P.BARE_CREDENTIAL, cutBareCredential) : cut;
}

/* A Digest header's `username=` names a parameter; its proof is cut by its own rule. */
function cutAuthorization(match: string, head: string, scheme = "", value = ""): string {
  return P.AUTH_PARAM.test(value) ? match : `${head}${scheme}${REDACTED}`;
}

function cutAuthValue(
  match: string,
  before: string,
  scheme: string,
  between: string,
  value: string,
): string {
  if (!isSecretLike(value) || P.AUTH_PARAM.test(value)) return match;
  return `${before}${scheme}${between}${REDACTED}`;
}

function cutPostgresKey(
  match: string,
  open: string,
  columns: string,
  between: string,
  _values: string,
  close: string,
): string {
  const secret = columns.split(/[\s,]+/).some((column) => secretName(column) !== undefined);
  return secret ? `${open}${columns}${between}${REDACTED}${close}` : match;
}

function cutPair(
  match: string,
  before: string,
  name: string,
  quote: string,
  spaceBefore: string,
  separator: string,
  spaceAfter: string,
  value: string,
): string {
  const strength = secretName(name);
  if (strength === undefined || value === REDACTED || P.ALREADY_URL.test(value)) return match;
  const head = `${before}${name}${quote}${spaceBefore}${separator}${spaceAfter}`;
  const opening = value[0];
  if (opening === '"' || opening === "'") return cutQuoted(match, head, value, opening, strength);
  /* `name=value` is a query or a setting; after `:` the next word may be prose. */
  const assigned = separator === "=" && spaceBefore === "" && spaceAfter === "";
  const cut = strength === "strong" ? assigned || isSecretLike(value) : isSecretLike(value);
  return cut ? `${head}${REDACTED}` : match;
}

/* A quoted value, and one whose quote was left open and runs to the end. */
function cutQuoted(
  match: string,
  head: string,
  value: string,
  quote: string,
  strength: SecretName,
): string {
  const closed = value.length > 1 && value.endsWith(quote);
  const inner = closed ? value.slice(1, -1) : value.slice(1);
  if (inner === "") return match;
  if (strength === "weak" && (/\s/.test(inner) || !isSecretLike(inner))) return match;
  return `${head}${quote}${REDACTED}${closed ? quote : ""}`;
}

function cutSpaced(
  match: string,
  before: string,
  name: string,
  space: string,
  value: string,
): string {
  if (!isCredentialHeader(name) || value === REDACTED || !isSecretLike(value)) return match;
  return `${before}${name}${space}${REDACTED}`;
}

function cutBareCredential(match: string, before: string, user: string, value: string): string {
  if (!isSecretLike(value) || P.HEX.test(value)) return match;
  return `${before}${user}:${REDACTED}`;
}
