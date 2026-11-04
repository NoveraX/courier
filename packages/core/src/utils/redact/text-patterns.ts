/*
 * The patterns a credential is found by in an error's text. The text read
 * is at most 8000 characters, so a bound of 8192 cuts a value as long as
 * the text whole. Every quantifier is bounded, a lazy one only after a
 * fixed start, and no two neighbours share a character: no input makes a
 * pattern read a part of the text twice.
 */

/** A value as long as any text read. */
const LONG = 8192;

/** A private key in PEM, from its first line to its last. */
const PEM = new RegExp(
  `-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\\s\\S]{0,${LONG}}?-----END [A-Z ]{0,40}PRIVATE KEY-----`,
  "g",
);

/** undici quotes the header value it refused as it was, quotes and line breaks inside it and all. */
const APPENDED_HEADER =
  /(Headers\.(?:append|set): )"[\s\S]{0,4096}?"(?= is an invalid header (?:value|name))/g;

/** The value the platform's Headers and Node's http quote as they refuse it. */
const QUOTED_HEADER_VALUE = /"[^"]{0,4096}"(?= is an invalid header (?:value|name))/g;
const VALUE_FOR_HEADER = /(Invalid value )"[^"]{0,4096}"(?= for header ")/g;

/** A JWT, and a key in a known provider's format. */
const JWT = /(^|[^\w-])eyJ[\w-]{4,1024}\.[\w-]{4,2048}\.[\w-]{0,1024}/g;
const KNOWN_KEY =
  /(^|[^\w-])(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,256}|gh[pousr]_[A-Za-z0-9]{20,256}|github_pat_\w{20,256}|xox[abprs]-[A-Za-z0-9-]{10,256}|AKIA[0-9A-Z]{16}|AIza[\w-]{35}|glpat-[\w-]{20,256}|sk-[\w-]{20,256}|npm_[A-Za-z0-9]{36,256}|SG\.[\w-]{16,32}\.[\w-]{16,64})/g;

/** The value after `Authorization:` is the credential, whatever it reads like. */
const AUTHORIZATION_VALUE = new RegExp(
  `(\\b(?:proxy-)?authorization["']?[ \\t]{0,3}[:=][ \\t]{0,3})((?:bearer|basic|token|digest|negotiate|ntlm|apikey|api-key)[ \\t]{1,3})?([^\\s"'<>,;]{1,${LONG}})`,
  "gi",
);

/** A word after an authorization scheme, a credential when it reads as one. */
const AUTH_VALUE = new RegExp(
  `(^|[^\\w-])(bearer|basic|token|digest|negotiate|ntlm|apikey|api-key)([ \\t]{1,3}|[ \\t]{0,3}[:=][ \\t]{0,3})([\\w.~+/=-]{1,${LONG}})`,
  "gi",
);

/** What a Digest client proves it knows the password with. */
const DIGEST_RESPONSE = /(\b(?:response|cnonce)=)"[0-9a-f]{16,128}"/gi;

/** Postgres names the columns and the values of a key it refused: `Key (api_key)=(…)`. */
const POSTGRES_KEY = new RegExp(`(Key \\()([^)]{1,256})(\\)=\\()([^)]{0,${LONG}})(\\))`, "g");

/** A pair: a name, `=` or `:`, and a value, quoted or not; a quote left open runs to the end. */
const PAIR = new RegExp(
  `(^|[^\\w.-])([A-Za-z][\\w.-]{0,63})(["']?)([ \\t]{0,3})([=:])([ \\t]{0,3})("[^"]{0,${LONG}}"?|'[^']{0,${LONG}}'?|[^\\s&,;"'<>(){}[\\]]{1,${LONG}})`,
  "g",
);

/** A header's name and its value with only a space between: `x-api-key s3cr3t`. */
const SPACED = new RegExp(
  `(^|[^\\w.-])([A-Za-z][\\w-]{1,63})([ \\t]{1,3})([^\\s"'<>,;]{6,${LONG}})`,
  "g",
);

/** `user:password` with no host after it, read only where the text speaks of signing in. */
const BARE_CREDENTIAL =
  /(^|[\s"'(<,;=])([a-z][a-z._-]{1,31}):([^\s:/@"'<>]{6,128})(?=$|[\s"'),;>]|\.(?:\s|$))/g;
const AUTH_CONTEXT = /\b(?:auth\w*|log(?:in|on)|credentials?|basic|passw\w*|user(?:name)?s?)\b/i;

/** A value that is already an address: the address's own rules cut it. */
const ALREADY_URL = /^[a-z][a-z0-9+.-]{0,31}:\/\//i;
/** `realm=`, `error=`: the name of an authentication parameter, not a credential. */
const AUTH_PARAM = /^[a-z][a-z_-]{0,31}=$/i;
/** A hash, as `sha256:` names it: not a password. */
const HEX = /^[0-9a-f]+$/i;

/** The patterns a credential is found by in an error's text, by what each finds. */
export const TEXT_PATTERNS = {
  PEM,
  APPENDED_HEADER,
  QUOTED_HEADER_VALUE,
  VALUE_FOR_HEADER,
  JWT,
  KNOWN_KEY,
  AUTHORIZATION_VALUE,
  AUTH_VALUE,
  DIGEST_RESPONSE,
  POSTGRES_KEY,
  PAIR,
  SPACED,
  BARE_CREDENTIAL,
  AUTH_CONTEXT,
  ALREADY_URL,
  AUTH_PARAM,
  HEX,
} as const;
