import { sessionCookies } from "./session-credentials";
import { isDeletion, parseSetCookie, type SetCookie } from "./set-cookie";
import type { SessionOptions } from "./types";

/** A cookie an API's answer set where a page could read it, kept for the calls to come. */
interface LearnedCookie {
  readonly name: string;
  readonly value: string;
  /** The host that set it, or the domain it names */
  readonly domain: string;
  /** Whether only the host that set it gets it back: it named no `Domain` */
  readonly hostOnly: boolean;
  readonly path: string;
  readonly secure: boolean;
  /** When it runs out, in milliseconds since the epoch; never, while the app runs */
  readonly expiresAt: number | undefined;
}

/** What of an address a cookie is matched against. */
interface Address {
  readonly secure: boolean;
  readonly host: string;
  readonly path: string;
}

/* By name, domain and path, as a cookie store keys them: a cookie set again replaces the one before. */
const learned = new Map<string, LearnedCookie>();

/* Where one cookie ends and the next begins in a header the platform joined: a comma, then the
   next cookie's name and its `=`. A date's comma is followed by a day of the month, never by `name=`. */
const NEXT_COOKIE = /,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/;
const IP_ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|\[[\da-f:.]+\])$/i;

/**
 * Keep the session's cookies an API's answer sets where a page could read
 * them — not `HttpOnly` — for the calls to come: a React Native app keeps
 * its cookies where no script reads them, and is handed the `Set-Cookie`
 * headers of each answer instead. A cookie set `HttpOnly`, deleted or past
 * its time drops the one kept before; a cookie for a domain the address is
 * not in is refused, as the platform refuses it.
 *
 * @param upstream - The headers the API answered with
 * @param options - The API's session
 * @param address - Where the call went
 * @param now - The current time, in milliseconds
 * @example
 * ```ts
 * learnCookies(answer.headers, api.options.session, "https://api.example.com");
 * ```
 */
export function learnCookies(
  upstream: Headers | undefined,
  options: SessionOptions | undefined,
  address: string,
  now: number = Date.now(),
): void {
  const at = addressOf(address);
  if (upstream === undefined || options === undefined || at === undefined) return;
  const { kept } = sessionCookies(options);
  for (const header of setCookieHeaders(upstream)) {
    const cookie = parseSetCookie(header);
    if (cookie === undefined || !kept(cookie.name)) continue;
    if (cookie.domain !== undefined && !domainMatches(at.host, cookie.domain)) continue;
    const domain = cookie.domain ?? at.host;
    const path = cookie.path ?? "/";
    const key = `${cookie.name}\u0000${domain}\u0000${path}`;
    if (cookie.httpOnly || isDeletion(cookie, now)) learned.delete(key);
    else learned.set(key, learnedOf(cookie, domain, path, now));
  }
}

/**
 * The kept cookies a call to an address gets back, by name: those for its
 * host, or a domain it is in, whose path its own reaches or lies within —
 * the address is the API's, and its endpoints lie below it — the one for the
 * longest path first, as a `Cookie` header lists them.
 *
 * @param address - Where the call goes
 * @param now - The current time, in milliseconds
 * @returns Each cookie's value by its name
 * @example
 * ```ts
 * learnedJar("https://api.example.com").get("csrftoken"); // "t1"
 * ```
 */
export function learnedJar(address: string, now: number = Date.now()): Map<string, string> {
  const jar = new Map<string, string>();
  const at = addressOf(address);
  if (at === undefined) return jar;
  const applying: LearnedCookie[] = [];
  for (const [key, cookie] of learned) {
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) learned.delete(key);
    else if (appliesTo(cookie, at)) applying.push(cookie);
  }
  applying.sort((a, b) => b.path.length - a.path.length);
  for (const cookie of applying) if (!jar.has(cookie.name)) jar.set(cookie.name, cookie.value);
  return jar;
}

function learnedOf(cookie: SetCookie, domain: string, path: string, now: number): LearnedCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain,
    hostOnly: cookie.domain === undefined,
    path,
    secure: cookie.secure === true,
    expiresAt: expiryOf(cookie, now),
  };
}

/* Each Set-Cookie header of an answer. React Native joins them into one, as it joins any
   repeated header; where the platform lists them apart, a listed one is split all the same. */
function setCookieHeaders(headers: Headers): string[] {
  const listed = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const values = listed.length > 0 ? listed : [headers.get("set-cookie") ?? ""];
  return values
    .flatMap((value) => value.split(NEXT_COOKIE))
    .map((header) => header.trim())
    .filter((header) => header !== "");
}

function expiryOf(cookie: SetCookie, now: number): number | undefined {
  if (cookie.maxAge !== undefined) return now + cookie.maxAge * 1000;
  return cookie.expires === undefined ? undefined : Date.parse(cookie.expires);
}

function appliesTo(cookie: LearnedCookie, at: Address): boolean {
  if (cookie.secure && !at.secure) return false;
  const inScope = cookie.hostOnly
    ? at.host === cookie.domain
    : domainMatches(at.host, cookie.domain);
  return inScope && (pathWithin(at.path, cookie.path) || pathWithin(cookie.path, at.path));
}

/* RFC 6265 domain matching: the host itself, or a host below the domain, never an address's digits. */
function domainMatches(host: string, domain: string): boolean {
  return host === domain || (host.endsWith(`.${domain}`) && !IP_ADDRESS.test(host));
}

/* RFC 6265 path matching: the path itself, or one below it. */
function pathWithin(path: string, parent: string): boolean {
  if (path === parent) return true;
  return path.startsWith(parent) && (parent.endsWith("/") || path.charAt(parent.length) === "/");
}

/* React Native's URL reads an address with patterns and never refuses one, so an address
   with no host is no address here. */
function addressOf(address: string): Address | undefined {
  const url = new URL(address);
  const host = url.hostname.toLowerCase();
  if (host === "") return undefined;
  return { secure: url.protocol === "https:", host, path: url.pathname || "/" };
}
