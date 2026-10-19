import type { MDXProps } from "mdx/types"
import type { JSX } from "react"

/** What a docs page says of itself. */
export interface DocMeta {
  title: string
  description: string
  /** Which way of calling the API the page is about, when it is about one. */
  mode?: "direct" | "proxy" | "both" | undefined
  /** When the page last changed, `YYYY-MM-DD`: every docs page writes it, an examples page does not. */
  updated?: string | undefined
}

/** A docs page: its content, ready to render, and what it says of itself. */
export interface DocModule {
  Content: (props: MDXProps) => JSX.Element
  meta: DocMeta
}

/**
 * Load a docs page's MDX module. The caller makes sure the page exists
 * first, from its source: a page that does not exist fails to import.
 *
 * @param slug - The page's path segments
 * @returns The page
 * @example
 * ```ts
 * if (docSource(slug)) (await loadDoc(slug)).meta.title // "Quick Start"
 * ```
 */
export async function loadDoc(slug: readonly string[]): Promise<DocModule> {
  const mod = await import(`@/content/docs/${slug.join("/")}.mdx`)
  return { Content: mod.default, meta: mod.metadata }
}
