const REDACTED = "[redacted]";
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()]+/gi;
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i;
/* The platform's Headers quotes the value it refused: an Authorization header read with its line break. */
const INVALID_HEADER = /"[^"]*"(?= is an invalid header (?:value|name))/g;
const AUTH_SCHEME =
  /\b(Bearer|bearer|BEARER|Basic|basic|Token|Digest|Negotiate|NTLM|ApiKey|Api-Key)\s+(?!\[redacted\])[^\s"',;]+/g;
const SECRET_PAIR =
  /\b([\w.-]*?(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|signature|credential|authorization|cookie)[\w.-]*)(["']?\s*[=:]\s*)(?![a-z][a-z0-9+.-]*:\/\/)("[^"]*"|'[^']*'|[^\s&,;"'}]+)/gi;

/**
 * An error's text as Studio may be told it: control characters made
 * spaces, and what could be a credential cut out — a header value the
 * platform refused and quoted, what follows an authorization scheme
 * (`Bearer …`), the value of a pair whose name says it is secret
 * (`token=…`, `"password": …`), and in every URL its user, password,
 * query and fragment — then cut to `maxLength` characters.
 *
 * The error the caller receives keeps its text: only what Studio is told
 * is cut.
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
  const shown = printable(text)
    .replace(INVALID_HEADER, `"${REDACTED}"`)
    .replace(URL_IN_TEXT, withoutSecrets)
    .replace(AUTH_SCHEME, `$1 ${REDACTED}`)
    .replace(SECRET_PAIR, `$1$2${REDACTED}`)
    .trim();
  return shown.length > maxLength ? `${shown.slice(0, maxLength - 1)}…` : shown;
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

/* What the URL addresses, never what it carries: no user, password, query or fragment. */
function withoutSecrets(address: string): string {
  try {
    const url = new URL(address);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    /* Not a URL the parser reads: cut by hand what could carry a secret. */
    return address.replace(USERINFO, "$1").replace(/[?#].*$/, "");
  }
}
