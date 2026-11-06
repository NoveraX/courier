/**
 * The docs as text, read where no MDX compiler or bundler is at hand — by
 * the site's Markdown and index routes, and by the docs package's build.
 * The modules that read and write them import only Node's own modules and
 * one another; every page's metadata, read from its source, is what its
 * export holds; and every section of the navigation keeps a lasting id,
 * which its icon in the site's layout is found by.
 */
import fs from "node:fs"
import path from "node:path"
import { runInNewContext } from "node:vm"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { docPages } from "@/site/content/docs-files"
import { docsNav } from "@/site/content/docs-nav"
import { metadataLines } from "@/site/content/source-metadata"
import { SECTION_ICONS } from "@/site/layout/section-icon"

const CONTENT = path.join(process.cwd(), "src/site/content")
/* What the docs package's build reads the docs with. */
const ENTRIES = ["docs-files.ts", "docs-nav.ts", "page-markdown.ts", "llms.ts", "search-index.ts"]

/* Every module a file imports, as TypeScript reads them: type-only imports too. */
function importsOf(file: string): string[] {
  const { importedFiles } = ts.preProcessFile(fs.readFileSync(file, "utf8"), true, true)
  return importedFiles.map((imported) => imported.fileName)
}

describe("the modules the docs are read as text with", () => {
  it("import only Node's own modules and one another", () => {
    const seen = new Set<string>()
    const outside: string[] = []
    const visit = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith("node:")) continue
        if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), `${specifier}.ts`))
        else outside.push(`${path.relative(CONTENT, file)} imports ${specifier}`)
      }
    }
    for (const entry of ENTRIES) visit(path.join(CONTENT, entry))

    expect(outside).toEqual([])
    expect(seen.size).toBeGreaterThan(ENTRIES.length)
  })
})

describe("a page's metadata, read from its source", () => {
  it("is what its export holds, on every page", () => {
    const pages = docPages()
    for (const page of pages) {
      const lines = page.source.split("\n")
      const range = metadataLines(lines)
      const literal = lines
        .slice(range?.start ?? 0, (range?.end ?? -1) + 1)
        .join("\n")
        .replace(/^export const metadata = /, "")
      const held = runInNewContext(`(${literal})`) as { title: string; description: string }
      expect({ title: page.title, description: page.description }, page.slug.join("/")).toEqual({
        title: held.title,
        description: held.description,
      })
    }
    expect(pages.length).toBeGreaterThan(100)
  })
})

describe("the navigation's sections", () => {
  it("each keep an id of their own, which their icon in the layout is found by", () => {
    const ids = docsNav.map((section) => section.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(SECTION_ICONS).sort()).toEqual([...ids].sort())
  })
})
