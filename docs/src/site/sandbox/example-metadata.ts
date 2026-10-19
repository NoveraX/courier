import type { Metadata } from "next"

import { findNavContext } from "@/site/content/docs-nav"
import { pageMetadata } from "@/site/seo/page-metadata"
import { EXAMPLE_PAGES, type ExampleName } from "./example-pages"

/**
 * An examples page's metadata. Its title says it is an example, as most
 * examples share their title with the guide they run.
 *
 * @param name - The page, by the last segment of its address
 * @returns The page's metadata
 * @example
 * ```ts
 * export const metadata = exampleMetadata("streaming") // titled "Streaming example — Courier Docs"
 * ```
 */
export function exampleMetadata(name: ExampleName): Metadata {
  const { title, description } = EXAMPLE_PAGES[name]
  const path = `/docs/examples/${name}`
  return pageMetadata({
    path,
    title: `${title} example`,
    description,
    section: findNavContext(path)?.section.label ?? "Examples",
  })
}
