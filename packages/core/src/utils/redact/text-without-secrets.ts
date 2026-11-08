import { isCredentialHeader } from "../is-credential-header";

import { isSecretLike } from "./is-secret-like";
import { REDACTED } from "./redacted";
import { isSecretValue, type SecretName, secretName } from "./secret-name";
import { TEXT_PATTERNS as P } from "./text-patterns";

/**
 * A text with what could be a credential cut out, the rest as it was: a
 * private key, a header value the platform refused and quoted, a JWT, a
 * key in a known provider's format, the value after `Authorization:`, a
 * word after an authorization scheme that reads as one, and after a word
 * that says one follows — `bad credentials Zq9x…` — a Digest proof,
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
    .replace(P.SPOKEN, cutAuthValue)
    .replace(P.DIGEST_RESPONSE, `$1"${REDACTED}"`)
    .replace(P.POSTGRES_KEY, cutPostgresKey)
    .replace(P.JSON_PAIR, cutJsonPair)
    .replace(P.PAIR, (match: string, ...pair: string[]) => cutPair(match, pair, 0))
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

/* A strong column's values are cut whatever they are; a weak one's where one reads as a credential. */
function cutPostgresKey(
  match: string,
  open: string,
  columns: string,
  between: string,
  values: string,
  close: string,
): string {
  const named = columns.split(/[\s,]+/).map((column) => secretName(column));
  const secret =
    named.includes("strong") ||
    (named.includes("weak") && values.split(/[\s,]+/).some((value) => isSecretLike(value)));
  return secret ? `${open}${columns}${between}${REDACTED}${close}` : match;
}

/* A number or a flag after a key in quotes is that key's value, as a record's field holds it. */
const JSON_LITERAL = /^(?:-?\d{1,64}(?:\.\d{1,64})?(?:[eE][+-]?\d{1,4})?|true|false)$/;

/* A JSON key in quotes is a key wherever it stands: `fetch = "token": "…"` names no pair `fetch`. */
function cutJsonPair(
  match: string,
  quote: string,
  name: string,
  between: string,
  value: string,
): string {
  const strength = secretName(name);
  if (strength === undefined || value === REDACTED) return match;
  const head = `${quote}${name}${quote}${between}`;
  if (JSON_LITERAL.test(value)) return isSecretValue(name, value) ? `${head}${REDACTED}` : match;
  return cutValue(head, value, strength, ":", " ") ?? match;
}

/* A pair a value is read for, how deep: `Error: password=…` holds its secret one level down. */
const INNER_PAIRS = 8;

/* A pair, its secret value cut; or, when its name says nothing secret, the pair its value may
   hold — `Error: password=…`, `"message": "token=…"` — read the same way, a few levels deep. */
function cutPair(match: string, pair: string[], depth: number): string {
  const [before = "", name = "", quote = "", spaceBefore = "", separator = "", spaceAfter = ""] =
    pair;
  const value = pair[6] ?? "";
  if (value === REDACTED || P.ALREADY_URL.test(value)) return match;
  const head = `${before}${name}${quote}${spaceBefore}${separator}${spaceAfter}`;
  const strength = secretName(name);
  const cut = strength && cutValue(head, value, strength, separator, spaceBefore + spaceAfter);
  if (cut) return cut;
  if (depth >= INNER_PAIRS) return match;
  return `${head}${value.replace(P.PAIR, (inner: string, ...held: string[]) => cutPair(inner, held, depth + 1))}`;
}

function cutValue(
  head: string,
  value: string,
  strength: SecretName,
  separator: string,
  spaces: string,
): string | undefined {
  const opening = value[0];
  if (opening === '"' || opening === "'") return cutQuoted(head, value, opening, strength);
  /* `name=value` is a query or a setting; after `:` the next word may be prose. */
  const assigned = separator === "=" && spaces === "";
  const cut = strength === "strong" ? assigned || isSecretLike(value) : isSecretLike(value);
  return cut ? `${head}${REDACTED}` : undefined;
}

/* A quoted value, and one whose quote was left open and runs to the end. */
function cutQuoted(
  head: string,
  value: string,
  quote: string,
  strength: SecretName,
): string | undefined {
  const closed = value.length > 1 && value.endsWith(quote);
  const inner = closed ? value.slice(1, -1) : value.slice(1);
  if (inner === "") return undefined;
  if (strength === "weak" && (/\s/.test(inner) || !isSecretLike(inner))) return undefined;
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
