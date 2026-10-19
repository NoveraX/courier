import { SITE_URL } from "@/site/site-url"

/** The name the site goes by: in its titles, social cards and search results. */
export const SITE_NAME = "Courier"

/**
 * The names search engines may show for the site when "Courier" alone is
 * taken by another: the publisher's, and the package's on npm.
 */
export const SITE_ALTERNATE_NAMES = ["Courier by NoveraX", "@noverax/courier"] as const

/** What the site is found by: Courier's names, and what it is to someone looking for one. */
export const SITE_KEYWORDS = [
  "Courier",
  "@noverax/courier",
  "TypeScript HTTP client",
  "type-safe API client",
  "typed fetch",
  "REST API client",
  "end-to-end type safety",
  "React Query",
  "API proxy",
  "Next.js",
  "OpenAPI",
  "MCP server",
  "API mocking",
  "API debugger",
] as const

/** What a docs page's title ends with, in a tab and in search results. */
export const DOCS_TITLE_SUFFIX = "Courier Docs"

/** The language every page is written in, as Open Graph spells it. */
export const SITE_LOCALE = "en_US"

/** Where Courier's source is kept. */
export const REPOSITORY_URL = "https://github.com/NoveraX/courier"

/** Who publishes Courier, as search engines and social cards name it. */
export const ORGANIZATION = {
  name: "NoveraX",
  url: "https://github.com/NoveraX",
  logo: `${SITE_URL}/web-app-manifest-512x512.png`,
  sameAs: ["https://github.com/NoveraX", "https://www.npmjs.com/org/noverax"],
} as const
