import { highlight } from "@/site/code/highlight"
import { loadDoc } from "@/site/content/doc-module"
import { docSource } from "@/site/content/docs-files"
import { docsNav } from "@/site/content/docs-nav"
import type { CodeFence } from "@/site/content/mdx-sections"
import { API_SECTION } from "@/site/content/nav-reference"
import type { ReferenceEntry, ReferenceParam } from "@/site/content/reference"
import { referenceEntry } from "@/site/content/reference"

/** A code block of the reference, highlighted for the page. */
export interface ShownCode {
  code: string
  html: string
}

/** A field of an export, its type highlighted when its page writes one out. */
export interface ShownParam extends Omit<ReferenceParam, "code"> {
  code: ShownCode | null
}

/** An export as the reference page shows it, its code highlighted. */
export interface ReferenceSection extends Omit<ReferenceEntry, "signature" | "example" | "params"> {
  signature: ShownCode | null
  example: ShownCode | null
  params: ShownParam[]
  /** The docs page the entry is read from. */
  page: string
}

async function shown(fence: CodeFence | null | undefined): Promise<ShownCode | null> {
  return fence ? { code: fence.code, html: await highlight(fence.code, fence.language) } : null
}

/**
 * Every export the API reference lists, in the docs navigation's order,
 * each read from its API page and its code highlighted.
 *
 * @returns The sections
 * @example
 * ```ts
 * (await referenceSections()).map((s) => s.name) // ["defineApi", "defineGroup / endpoint", …]
 * ```
 */
export async function referenceSections(): Promise<ReferenceSection[]> {
  const items = docsNav.find((section) => section.label === API_SECTION)?.items ?? []
  const sections = await Promise.all(
    items.map(async ({ href }) => {
      const slug = href.replace(/^\/docs\//, "").split("/")
      const source = docSource(slug)
      if (!source) return null
      const { meta } = await loadDoc(slug)
      const entry = referenceEntry(slug.at(-1) ?? "", source, meta)
      return {
        ...entry,
        signature: await shown(entry.signature),
        example: await shown(entry.example),
        params: await Promise.all(
          entry.params.map(async ({ code, ...param }) => ({ ...param, code: await shown(code) }))
        ),
        page: href,
      }
    })
  )
  return sections.filter((section): section is ReferenceSection => section !== null)
}
