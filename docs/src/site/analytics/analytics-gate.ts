import { SITE_URL } from "@/site/site-url"

/** Where a page runs, as the analytics gate sees it. */
export interface AnalyticsPlace {
  /** The host the page was loaded from. */
  hostname: string
  /** Whether the page is from a production build. */
  production: boolean
  /** Whether a machine drives the browser: a test, a crawler's renderer. */
  automated: boolean
}

/* The published site. A production build also runs on a developer's machine and in previews,
   and their visits are nobody's. */
const PUBLISHED_HOST = new URL(SITE_URL).hostname

/**
 * Whether the site may count visits here at all, before any reader is
 * asked: only the published site's production build, in a browser a
 * person drives.
 *
 * @param place - Where the page runs
 * @returns Whether analytics may run, once the reader agrees
 * @example
 * ```ts
 * analyticsAllowed({ hostname: "localhost", production: true, automated: false }) // false
 * ```
 */
export function analyticsAllowed({ hostname, production, automated }: AnalyticsPlace): boolean {
  return production && !automated && hostname === PUBLISHED_HOST
}

/**
 * Where the current page runs, read from the browser.
 *
 * @returns The page's place
 * @example
 * ```ts
 * analyticsAllowed(currentPlace())
 * ```
 */
export function currentPlace(): AnalyticsPlace {
  return {
    hostname: window.location.hostname,
    production: process.env.NODE_ENV === "production",
    automated: navigator.webdriver === true,
  }
}
