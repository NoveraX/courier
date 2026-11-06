import fs from "node:fs"
import path from "node:path"

import { sourceMetadata } from "./source-metadata"

/** Where the docs pages' MDX is: under the site's folder, where the site is built and served from. */
export const CONTENT_DIR = path.join(process.cwd(), "src/content/docs")

/** A docs page as text: where it is, its MDX source, and what its metadata says of it. */
export interface DocPage {
  /** The path segments of its address under `/docs`. */
  slug: string[]
  source: string
  title: string
  description: string
}

function slugsIn(dir: string, prefix: readonly string[]): string[][] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return slugsIn(path.join(dir, entry.name), [...prefix, entry.name])
    return entry.name.endsWith(".mdx") ? [[...prefix, entry.name.slice(0, -".mdx".length)]] : []
  })
}

/**
 * Every docs page there is, by the path segments of its address under
 * `/docs`: `["core-concepts", "caller"]` for `/docs/core-concepts/caller`.
 *
 * @param dir - Where the pages' MDX is: the site's own by default
 * @returns The pages' slugs
 * @example
 * ```ts
 * docSlugs().map((slug) => slug.join("/")) // ["advanced/abort", …, "why-courier"]
 * ```
 */
export function docSlugs(dir: string = CONTENT_DIR): string[][] {
  return fs.existsSync(dir) ? slugsIn(dir, []) : []
}

/**
 * A docs page's MDX source, as written.
 *
 * @param slug - The page's path segments
 * @param dir - Where the pages' MDX is: the site's own by default
 * @returns The source, or `null` when there is no such page
 * @example
 * ```ts
 * docSource(["quick-start"])?.startsWith("export const metadata") // true
 * ```
 */
export function docSource(slug: readonly string[], dir: string = CONTENT_DIR): string | null {
  if (slug.some((part) => part === ".." || part.includes("/") || part.includes("\\"))) return null
  const file = path.join(dir, `${slug.join("/")}.mdx`)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}

/**
 * Every docs page as text, its title and description read from its
 * source — as the site's Markdown, its text indexes and the docs package
 * read them, where no MDX compiler is at hand.
 *
 * @param dir - Where the pages' MDX is: the site's own by default
 * @returns The pages, in the order `docSlugs` lists them
 * @example
 * ```ts
 * docPages().find((page) => page.slug.join("/") === "quick-start")?.title // "Quick Start"
 * ```
 */
export function docPages(dir: string = CONTENT_DIR): DocPage[] {
  return docSlugs(dir).flatMap((slug) => {
    const source = docSource(slug, dir)
    if (source === null) return []
    const { title = "", description = "" } = sourceMetadata(source)
    return [{ slug, source, title, description }]
  })
}
