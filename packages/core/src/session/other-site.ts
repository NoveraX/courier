import { createLogger } from "../logger";
import type { SessionTarget } from "./session-target";
import type { SessionOptions } from "./types";

const log = createLogger("Session");
/* Each page origin and API address is weighed once: every call after asks a set. */
const weighed = new Set<string>();
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Say once, in a browser, when an API that keeps the user's session in
 * cookies is on another site than the page. Its cookies are then the
 * browser's to keep from it: Safari sends an API on another site none of
 * them, and Chrome and Firefox only those it sets `SameSite=None; Secure`,
 * so the session can reach the API in one browser and not in another.
 * Nothing is said where the API set `credentials` itself, nor where no
 * page is, in React Native.
 *
 * @param target - The call, as the session reads it
 * @param session - The API's session
 * @example
 * ```ts
 * warnIfOtherSite(target, { cookies: ["sid"] }); // the page on localhost, the API on 127.0.0.1
 * ```
 */
export function warnIfOtherSite(target: SessionTarget, session: SessionOptions): void {
  if ((session.cookies?.length ?? 0) === 0 || target.credentials !== undefined) return;
  const page = pageAddress();
  if (page === undefined || target.url === undefined) return;
  const key = `${page.origin} ${target.url}`;
  if (weighed.has(key)) return;
  weighed.add(key);
  const api = URL.canParse(target.url, page.href) ? new URL(target.url, page.href) : undefined;
  if (api === undefined || sameSite(page.hostname, api.hostname)) return;
  const name = target.name.split(".")[0] || target.name;
  log.warn(
    `${name}: the API at ${api.origin} is on another site than this page, ${page.origin}. Safari sends an API on another site none of its cookies, and Chrome and Firefox only the ones it sets SameSite=None; Secure, so the session may not reach it. Serve the API on this page's site, under a subdomain of it, or call it through Courier's proxy`,
  );
}

/**
 * Whether two hosts are one site, as a browser keeps cookies for it: the
 * same host, one under the other, or two sharing their last two labels —
 * `app.example.com` and `api.example.com`. An IP address is a site of its
 * own. Without the list of public suffixes, two hosts under one suffix such
 * as `github.io` count as one site, which errs toward saying nothing.
 *
 * @param a - A host
 * @param b - Another host
 * @returns Whether they are one site
 * @example
 * ```ts
 * sameSite("app.example.com", "api.example.com"); // true
 * sameSite("localhost", "127.0.0.1"); // false
 * ```
 */
export function sameSite(a: string, b: string): boolean {
  const [x, y] = [hostKey(a), hostKey(b)];
  if (x === y) return true;
  if (isAddress(x) || isAddress(y)) return false;
  if (x.endsWith(`.${y}`) || y.endsWith(`.${x}`)) return true;
  const [xs, ys] = [x.split("."), y.split(".")];
  return xs.length >= 2 && ys.length >= 2 && xs.slice(-2).join(".") === ys.slice(-2).join(".");
}

function hostKey(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[(.*)\]$/, "$1");
}

function isAddress(host: string): boolean {
  return IPV4.test(host) || host.includes(":");
}

/* The page's address as the browser holds it, read without parsing; none outside a page served over HTTP. */
function pageAddress(): { origin: string; hostname: string; href: string } | undefined {
  const location: unknown = Reflect.get(globalThis, "location");
  if (typeof location !== "object" || location === null) return undefined;
  const [origin, hostname, href]: unknown[] = ["origin", "hostname", "href"].map((field) =>
    Reflect.get(location, field),
  );
  if (typeof origin !== "string" || typeof hostname !== "string" || typeof href !== "string") {
    return undefined;
  }
  return hostname === "" ? undefined : { origin, hostname, href };
}
