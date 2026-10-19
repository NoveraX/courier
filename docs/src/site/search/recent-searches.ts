import type { SearchOption, SearchOptionKind } from "./search-types"

/** A result opened from search, kept to offer again while nothing is typed. */
export interface RecentSearch {
  href: string
  title: string
  trail: string[]
  kind: SearchOptionKind
}

/** Where the reader's recent results are kept: the browser's own storage. */
export type RecentStorage = Pick<Storage, "getItem" | "setItem">

const RECENT_KEY = "courier:recent-searches"
const RECENT_LIMIT = 6
const KINDS: ReadonlySet<string> = new Set(["page", "heading", "text"])

/* A path on this site. A browser takes `//host` and `/\host` for another
   site's address, so those are not. */
const SITE_PATH = /^\/(?![/\\])/

function isRecent(value: unknown): value is RecentSearch {
  return (
    typeof value === "object" &&
    value !== null &&
    "href" in value &&
    typeof value.href === "string" &&
    SITE_PATH.test(value.href) &&
    "title" in value &&
    typeof value.title === "string" &&
    "trail" in value &&
    Array.isArray(value.trail) &&
    value.trail.every((step: unknown) => typeof step === "string") &&
    "kind" in value &&
    typeof value.kind === "string" &&
    KINDS.has(value.kind)
  )
}

/**
 * The browser's storage, where the page may use it: a browser that blocks
 * a site's storage throws as the page reaches for it.
 *
 * @returns The storage, or `undefined` where the page may not keep anything
 * @example
 * ```ts
 * readRecent(browserStorage())
 * ```
 */
export function browserStorage(): RecentStorage | undefined {
  try {
    return window.localStorage
  } catch (error) {
    console.warn("Search keeps no recent results: the browser blocks this site's storage", error)
    return undefined
  }
}

/**
 * The results opened from search lately, newest first. What the storage
 * holds is the reader's to change, so only entries of the right shape,
 * leading to a page of the site, are taken.
 *
 * @param storage - Where they are kept
 * @returns The recent results
 * @example
 * ```ts
 * readRecent(browserStorage())[0]?.href // "/docs/installation"
 * ```
 */
export function readRecent(storage: RecentStorage | undefined): RecentSearch[] {
  try {
    const kept: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(kept) ? kept.filter(isRecent).slice(0, RECENT_LIMIT) : []
  } catch (error) {
    console.warn("Search could not read its recent results", error)
    return []
  }
}

function writeRecent(storage: RecentStorage | undefined, recent: RecentSearch[]): RecentSearch[] {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch (error) {
    console.warn("Search could not keep its recent results", error)
  }
  return recent
}

/**
 * Keeps a result opened from search at the top of the recent ones, once.
 *
 * @param storage - Where they are kept
 * @param option - The result opened
 * @returns The recent results now
 * @example
 * ```ts
 * rememberRecent(browserStorage(), option)
 * ```
 */
export function rememberRecent(
  storage: RecentStorage | undefined,
  { href, title, trail, kind }: SearchOption
): RecentSearch[] {
  if (!SITE_PATH.test(href)) return readRecent(storage)
  const recent: RecentSearch = {
    href,
    title: title.map((part) => part.text).join(""),
    trail: [...trail],
    kind,
  }
  const others = readRecent(storage).filter((kept) => kept.href !== href)
  return writeRecent(storage, [recent, ...others].slice(0, RECENT_LIMIT))
}

/**
 * Forgets every recent result.
 *
 * @param storage - Where they are kept
 * @returns No recent results
 * @example
 * ```ts
 * forgetRecent(browserStorage()) // []
 * ```
 */
export function forgetRecent(storage: RecentStorage | undefined): RecentSearch[] {
  return writeRecent(storage, [])
}
