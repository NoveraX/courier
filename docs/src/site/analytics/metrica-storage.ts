/* What Metrica's code keeps on the site: cookies and storage keys starting `_ym`, the `gdpr`
   cookie it marks a visitor with, its tag manager's keys and `zz`. */
const METRICA_PREFIX = "_ym"
const METRICA_COOKIES: ReadonlySet<string> = new Set(["gdpr"])

function isMetricaKey(key: string): boolean {
  return key.startsWith(METRICA_PREFIX) || key.startsWith("ytm_") || key === "zz"
}

/** The page's cookies, as `document.cookie` reads and writes them. */
export interface CookieJar {
  cookie: string
}

/** The browser storage, as far as forgetting keys needs it. */
export type ForgettingStorage = Pick<Storage, "length" | "key" | "removeItem">

/**
 * The domains a cookie of this host may have been set for: the host
 * itself and each domain above it, down to the registrable one — a counter
 * sets its cookies for the widest it may.
 *
 * @param hostname - The page's host
 * @returns The domains, narrowest first
 * @example
 * ```ts
 * cookieDomains("courier.noverax.cloud") // ["courier.noverax.cloud", "noverax.cloud"]
 * ```
 */
export function cookieDomains(hostname: string): string[] {
  const labels = hostname.split(".")
  return labels.slice(0, -1).map((_, start) => labels.slice(start).join("."))
}

/**
 * The names of Metrica's cookies among the page's.
 *
 * @param cookie - The page's cookies, as `document.cookie` reads them
 * @returns The names
 * @example
 * ```ts
 * metricaCookieNames("theme=dark; _ym_uid=1; gdpr=0") // ["_ym_uid", "gdpr"]
 * ```
 */
export function metricaCookieNames(cookie: string): string[] {
  return cookie
    .split(";")
    .map((pair) => pair.trim().split("=")[0] ?? "")
    .filter((name) => name.startsWith(METRICA_PREFIX) || METRICA_COOKIES.has(name))
}

/**
 * Deletes Metrica's cookies, for this host and every domain above it,
 * once a reader withdraws their consent.
 *
 * @param jar - The page's cookies
 * @param hostname - The page's host
 * @example
 * ```ts
 * forgetMetricaCookies(document, location.hostname)
 * ```
 */
export function forgetMetricaCookies(jar: CookieJar, hostname: string): void {
  for (const name of metricaCookieNames(jar.cookie)) {
    const expired = `${name}=; Max-Age=0; Path=/`
    jar.cookie = expired
    for (const domain of cookieDomains(hostname)) {
      jar.cookie = `${expired}; Domain=${domain}`
    }
  }
}

/**
 * Deletes what Metrica's code kept in one of the browser's storages, once
 * a reader withdraws their consent.
 *
 * @param storage - The local or the session storage, where the page may use it
 * @example
 * ```ts
 * forgetMetricaStorage(window.localStorage)
 * ```
 */
export function forgetMetricaStorage(storage: ForgettingStorage | undefined): void {
  if (!storage) return
  const keys: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key !== null && isMetricaKey(key)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}
