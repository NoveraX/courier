/* The new site is served under /next until it replaces the old one. */
const SITE_BASE = "/next"

/**
 * A site path as the new pages link it: one of the site's own pages under
 * the base the new site is served from, anything else as it is.
 *
 * @param href - The path as a page or the navigation writes it
 * @returns The path to link
 * @example
 * ```ts
 * sitePath("/docs/quick-start") // "/next/docs/quick-start"
 * sitePath("https://github.com/NoveraX/courier") // unchanged
 * ```
 */
export function sitePath(href: string): string {
  if (href === "/") return SITE_BASE
  return href.startsWith("/") && !href.startsWith("//") ? `${SITE_BASE}${href}` : href
}

/**
 * The site path a page is at, as the navigation and the pages write it —
 * the reverse of `sitePath`.
 *
 * @param pathname - The address the browser shows
 * @returns The path without the base the new site is served from
 * @example
 * ```ts
 * pagePath("/next/docs/quick-start") // "/docs/quick-start"
 * ```
 */
export function pagePath(pathname: string): string {
  if (pathname === SITE_BASE) return "/"
  return pathname.startsWith(`${SITE_BASE}/`) ? pathname.slice(SITE_BASE.length) : pathname
}
