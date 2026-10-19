/** A social card's size: what Open Graph and X expect of a large image. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

/**
 * Where a page's social card is drawn: the home page has a card of its own,
 * and the site draws one for every other page from what the page says of
 * itself.
 *
 * @param path - The page's address
 * @returns The card's address
 * @example
 * ```ts
 * ogImagePath("/docs/quick-start") // "/og/docs/quick-start"
 * ```
 */
export function ogImagePath(path: string): string {
  return path === "/" ? "/opengraph-image" : `/og${path}`
}
