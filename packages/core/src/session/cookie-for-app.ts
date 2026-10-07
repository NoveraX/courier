import type { SetCookie } from "./set-cookie";

/** A cookie made for the application's origin, or why none could be. */
export type AppCookie =
  | { cookie: SetCookie; refused?: undefined }
  | { cookie?: undefined; refused: string };

/**
 * A cookie the API set, made over for the application's origin, which is
 * where the browser keeps it from now on.
 *
 * The API's path names its own routes, not the application's pages, so the
 * cookie is set for every path of the application — the one place its
 * server sees it again. A `Domain` is kept only where it covers the
 * application's host, which a browser would refuse otherwise; without one
 * the cookie stays with that host alone. `Secure` follows the application:
 * set when it is served over HTTPS or from the local machine, where browsers
 * keep secure cookies, and dropped elsewhere, together with what needs it —
 * `Partitioned`, and `SameSite=None`, which becomes `Lax`. A `__Secure-` or
 * `__Host-` cookie cannot exist without it, and is refused instead.
 *
 * @param cookie - The cookie as the API set it
 * @param origin - The application's origin, as its user addressed it; unknown, the cookie keeps its own `Secure`
 * @returns The cookie for the application, or why it cannot be set there
 * @example
 * ```ts
 * cookieForApp({ name: "sid", value: "a1", path: "/v1", domain: "api.example.com" }, "https://app.example.com");
 * // { cookie: { name: "sid", value: "a1", path: "/", secure: true } }
 * ```
 */
export function cookieForApp(cookie: SetCookie, origin: string | undefined): AppCookie {
  const app = origin !== undefined && URL.canParse(origin) ? new URL(origin) : undefined;
  const secure = app ? isSecureContext(app) : cookie.secure === true;
  const prefixed = /^__(Secure|Host)-/.test(cookie.name);
  if (prefixed && !secure) {
    return { refused: `${cookie.name} needs a secure origin, and ${origin} is not one` };
  }

  const made: SetCookie = { ...cookie, path: "/", secure };
  const host = app?.hostname;
  const keepsDomain =
    !cookie.name.startsWith("__Host-") && host !== undefined && covers(cookie.domain, host);
  if (!keepsDomain) delete made.domain;
  if (!secure) {
    delete made.partitioned;
    if (made.sameSite === "None") made.sameSite = "Lax";
  }
  return { cookie: made };
}

/* Browsers keep a secure cookie for HTTPS, and for the local machine over plain HTTP. */
function isSecureContext(url: URL): boolean {
  if (url.protocol === "https:") return true;
  const host = url.hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127(\.\d{1,3}){3}$/.test(host)
  );
}

/* Whether a cookie's domain covers a host, as RFC 6265 domain-matches one; never an address. */
function covers(domain: string | undefined, host: string): boolean {
  if (domain === undefined || /^[\d.]+$/.test(host) || host.startsWith("[")) return false;
  return host === domain || host.endsWith(`.${domain}`);
}
