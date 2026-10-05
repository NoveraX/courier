import fs from "node:fs"
import path from "node:path"

const CONTENT_DIR = path.join(process.cwd(), "src/content/docs")

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
 * @returns The pages' slugs
 * @example
 * ```ts
 * docSlugs().map((slug) => slug.join("/")) // ["advanced/abort", …, "why-courier"]
 * ```
 */
export function docSlugs(): string[][] {
  return fs.existsSync(CONTENT_DIR) ? slugsIn(CONTENT_DIR, []) : []
}

/**
 * A docs page's MDX source, as written.
 *
 * @param slug - The page's path segments
 * @returns The source, or `null` when there is no such page
 * @example
 * ```ts
 * docSource(["quick-start"])?.startsWith("export const metadata") // true
 * ```
 */
export function docSource(slug: readonly string[]): string | null {
  if (slug.some((part) => part === ".." || part.includes("/") || part.includes("\\"))) return null
  const file = path.join(CONTENT_DIR, `${slug.join("/")}.mdx`)
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
}
