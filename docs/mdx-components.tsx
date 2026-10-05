import type { MDXComponents } from "mdx/types"

import { SITE_COMPONENTS } from "@/site/mdx/site-components"

/**
 * The components every MDX page renders with: the site's own, then any a
 * page passes itself.
 *
 * @param components - A page's own components
 * @returns The components
 * @example
 * ```ts
 * useMDXComponents({}).Callout // the site's callout
 * ```
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...SITE_COMPONENTS, ...components }
}
