import { type CookieMatcher, cookieMatcher } from "./cookie-names";
import type { SessionOptions } from "./types";

/** What a session gives one call: the user's credentials, and the token a write repeats. */
export interface SessionCredentials {
  /** The session's cookies, as a `Cookie` header */
  readonly cookie?: string | undefined;
  /** The token sent as `Authorization: Bearer` */
  readonly bearer?: string | undefined;
  /** The double-submit token */
  readonly csrf?: string | undefined;
  /** Whether any of it says who the user is: a session cookie, or the bearer token */
  readonly identifies: boolean;
}

/** Which cookies a session sends, and which of the API's it keeps. */
interface SessionCookies {
  /** The ones that say who the user is */
  readonly credentials: CookieMatcher;
  /** Those, and the double-submit token's: sent with every call */
  readonly sent: CookieMatcher;
  /** Those, and the bearer token's: taken back from the API's answers */
  readonly kept: CookieMatcher;
}

const compiled = new WeakMap<SessionOptions, SessionCookies>();

/**
 * The cookie names a session reads and keeps, compiled once per session.
 *
 * @param options - The session
 * @returns Its matchers
 * @example
 * ```ts
 * sessionCookies({ cookies: ["sid"], bearer: "at" }).kept("at"); // true
 * ```
 */
export function sessionCookies(options: SessionOptions): SessionCookies {
  let cookies = compiled.get(options);
  if (cookies === undefined) {
    const named = options.cookies ?? [];
    const csrf = options.csrf ? [options.csrf.cookie] : [];
    const bearer = options.bearer ? [options.bearer] : [];
    cookies = {
      credentials: cookieMatcher(named),
      sent: cookieMatcher([...named, ...csrf]),
      kept: cookieMatcher([...named, ...csrf, ...bearer]),
    };
    compiled.set(options, cookies);
  }
  return cookies;
}

/**
 * What the session sends with a call, read from the cookies the request
 * being served has now. A cookie with no value is no session.
 *
 * @param jar - The request's cookies by name
 * @param options - The session
 * @returns The credentials
 * @example
 * ```ts
 * sessionCredentials(new Map([["sid", "a1"], ["theme", "dark"]]), { cookies: ["sid"] });
 * // { cookie: "sid=a1", identifies: true }
 * ```
 */
export function sessionCredentials(
  jar: ReadonlyMap<string, string>,
  options: SessionOptions,
): SessionCredentials {
  const { credentials, sent } = sessionCookies(options);
  const pairs: string[] = [];
  let identifies = false;
  for (const [name, value] of jar) {
    if (value === "" || !sent(name)) continue;
    pairs.push(`${name}=${value}`);
    identifies ||= credentials(name);
  }
  const bearer = options.bearer ? tokenOf(jar.get(options.bearer), BEARER) : undefined;
  const csrf = options.csrf ? tokenOf(jar.get(options.csrf.cookie), VISIBLE) : undefined;
  return {
    cookie: pairs.length > 0 ? pairs.join("; ") : undefined,
    bearer,
    csrf,
    identifies: identifies || bearer !== undefined,
  };
}

/* RFC 6750's b64token, the form a bearer token takes. */
const BEARER = /^[A-Za-z0-9\-._~+/]+=*$/;
/* Printable characters without spaces: what a header can carry as one token. */
const VISIBLE = /^[!-~]+$/;

/**
 * A token as a header carries it. A framework's cookie API writes values
 * URL-encoded, so a cookie is decoded first, as browser libraries decode one
 * before repeating it; a value that does not decode to a token is tried as
 * it came, and one that is no token either is not sent.
 */
function tokenOf(value: string | undefined, form: RegExp): string | undefined {
  if (value === undefined || value === "") return undefined;
  const decoded = decodedOrSelf(value);
  if (form.test(decoded)) return decoded;
  return form.test(value) ? value : undefined;
}

function decodedOrSelf(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    /* Not URL-encoded after all — a literal `%` — so it is its own value. */
    return value;
  }
}
