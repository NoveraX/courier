import type { NavItem } from "./docs-nav"
import { flatNavItems } from "./docs-nav"

/**
 * The pages before and after one, in the navigation's order — what the
 * Previous and Next links at the foot of a page lead to.
 *
 * @param href - The page's address
 * @returns The page before and the page after, where there are any
 * @example
 * ```ts
 * neighbors("/docs/quick-start") // { previous: Installation, next: Project Setup }
 * ```
 */
export function neighbors(href: string): { previous?: NavItem; next?: NavItem } {
  const items = flatNavItems()
  const at = items.findIndex((item) => item.href === href)
  if (at < 0) return {}
  const previous = items[at - 1]
  const next = items[at + 1]
  return { ...(previous && { previous }), ...(next && { next }) }
}
