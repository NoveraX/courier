import { BUILD_SECTIONS } from "./nav-build"
import { LEARN_SECTIONS } from "./nav-learn"
import { REFERENCE_SECTIONS } from "./nav-reference"
import type { NavContext, NavItem, NavSection } from "./nav-types"

export type { NavContext, NavItem, NavSection } from "./nav-types"

/** Every section of the docs' navigation, in the order the sidebar lists them. */
export const docsNav: NavSection[] = [...LEARN_SECTIONS, ...BUILD_SECTIONS, ...REFERENCE_SECTIONS]

/**
 * Every page the navigation lists, in order, without the disabled ones —
 * what Previous and Next walk through.
 *
 * @returns The pages
 * @example
 * ```ts
 * flatNavItems()[0]?.href // "/docs/introduction"
 * ```
 */
export function flatNavItems(): NavItem[] {
  return docsNav.flatMap((section) => section.items.filter((item) => !item.disabled))
}

/**
 * The section and the page of the navigation an address belongs to.
 *
 * @param pathname - The page's address
 * @returns Its section and its page, or `null` when the navigation does not list it
 * @example
 * ```ts
 * findNavContext("/docs/introduction")?.section.label // "Introduction"
 * ```
 */
export function findNavContext(pathname: string): NavContext | null {
  for (const section of docsNav) {
    const item = section.items.find((i) => i.href === pathname)
    if (item) return { section, item }
  }
  return null
}
