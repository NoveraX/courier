import type { CodeFence, MdxSection } from "./mdx-sections"
import { fencesOf, firstParagraph, outsideFences, sectionsOf } from "./mdx-sections"

/** What kind of export a reference entry is. */
export type ReferenceKind = "FUNCTION" | "CLASS" | "TYPE" | "FILE"

/** A named part of something, and what it is for. */
export interface ReferenceField {
  name: string
  desc: string
}

/** A field or argument an export takes, as its page describes it. */
export interface ReferenceParam extends ReferenceField {
  /** The type the page writes out for it, when it does. */
  code?: CodeFence | undefined
  /** The fields of that type the page lists below it. */
  fields: ReferenceField[]
}

/** One export as the reference shows it, read from its API page. */
export interface ReferenceEntry {
  /** The API page's file name, the entry's anchor. */
  id: string
  name: string
  kind: ReferenceKind
  /** The module it is imported from. */
  from: string
  /** The import its page writes, word for word; empty when the page writes none. */
  importLine: string
  desc: string
  signature: CodeFence | null
  params: ReferenceParam[]
  example: CodeFence | null
}

const PROPERTY = /^- `([^`]+)` — (.*)$/
const IMPORT_LINE = /^import (?!type\b).* from "(@noverax\/[^"]+)"$/m

function section(sections: readonly MdxSection[], ...headings: string[]): MdxSection | undefined {
  return sections.find((s) =>
    headings.some((heading) => s.heading.toLowerCase() === heading.toLowerCase())
  )
}

function fieldsOf(lines: readonly string[]): ReferenceField[] {
  return outsideFences(lines).flatMap((line) => {
    const match = PROPERTY.exec(line.trim())
    return match?.[1] && match[2] ? [{ name: match[1], desc: match[2] }] : []
  })
}

function paramsOf(sections: readonly MdxSection[]): ReferenceParam[] {
  const parameters = section(sections, "Parameters")
  if (parameters) {
    return sectionsOf(parameters.lines, 3).map((sub) => ({
      name: sub.heading,
      desc: firstParagraph(sub.lines),
      code: fencesOf(sub.lines)[0],
      fields: fieldsOf(sub.lines),
    }))
  }
  const properties = section(sections, "Properties")
  return fieldsOf(properties?.lines ?? []).map((field) => ({ ...field, fields: [] }))
}

function kindOf(title: string, signature: CodeFence | null): ReferenceKind {
  if (title.endsWith(".ts")) return "FILE"
  if (signature && /\bclass\s/.test(signature.code)) return "CLASS"
  return /^[A-Z]/.test(title) ? "TYPE" : "FUNCTION"
}

/**
 * An export as the API reference shows it, read from its docs page — the
 * import its Import block (else its first code) writes, its Signature (or the first code after the
 * import), the fields its Parameters or Properties describe, and the first
 * example of its Basic Usage — so the reference and the pages never part.
 *
 * @param id - The page's file name
 * @param source - The page's MDX source
 * @param meta - The page's title and description
 * @returns The entry
 * @example
 * ```ts
 * referenceEntry("create-caller", source, meta).from // "@noverax/courier"
 * ```
 */
export function referenceEntry(
  id: string,
  source: string,
  meta: { title: string; description: string }
): ReferenceEntry {
  const sections = sectionsOf(source.split("\n"), 2)
  const importCode = fencesOf(section(sections, "Import")?.lines ?? [])[0]?.code ?? ""
  const named = section(sections, "Signature", `${meta.title} Class`)
  const signature =
    fencesOf(named?.lines ?? [])[0] ??
    sections.flatMap((s) => (s.heading === "Import" ? [] : fencesOf(s.lines)))[0] ??
    null
  const imported = IMPORT_LINE.exec(importCode) ?? IMPORT_LINE.exec(signature?.code ?? "")
  return {
    id,
    name: meta.title,
    kind: kindOf(meta.title, signature),
    from: imported?.[1] ?? "",
    importLine: imported?.[0] ?? "",
    desc: meta.description,
    signature,
    params: paramsOf(sections),
    example: fencesOf(section(sections, "Basic Usage", "Usage")?.lines ?? [])[0] ?? null,
  }
}
