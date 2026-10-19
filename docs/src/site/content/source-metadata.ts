import { jsxText } from "./jsx-literals"

/** The fields a docs page's metadata export writes as plain strings, read from its source. */
export interface SourceMetadata {
  title?: string | undefined
  description?: string | undefined
  updated?: string | undefined
}

/**
 * Where a docs page's metadata export sits among its lines: the line it
 * starts on, and the line its object closes on — the same line for an
 * export written on one.
 *
 * @param lines - The page's source, line by line
 * @returns The first and last line of the export, or `null` when the page has none
 * @example
 * ```ts
 * metadataLines(['export const metadata = { title: "T" }', "", "Text"]) // { start: 0, end: 0 }
 * ```
 */
export function metadataLines(lines: readonly string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.startsWith("export const metadata"))
  if (start < 0) return null
  let depth = 0
  let end = start
  for (; end < lines.length; end++) {
    const line = lines[end] ?? ""
    depth += (line.match(/[{[]/g)?.length ?? 0) - (line.match(/[}\]]/g)?.length ?? 0)
    if (depth <= 0) break
  }
  return { start, end: Math.min(end, lines.length - 1) }
}

/**
 * The fields a docs page's metadata export writes as plain strings — what
 * the page is titled, what it covers and when it last changed — read from
 * its source, where no MDX compiler is at hand.
 *
 * @param source - The page's MDX source
 * @returns The fields it writes as strings
 * @example
 * ```ts
 * sourceMetadata('export const metadata = { title: "Quick Start", description: "…" }').title // "Quick Start"
 * ```
 */
export function sourceMetadata(source: string): SourceMetadata {
  const lines = source.split("\n")
  const range = metadataLines(lines)
  if (!range) return {}
  const block = lines.slice(range.start, range.end + 1).join("\n")
  return {
    title: jsxText(block, "title"),
    description: jsxText(block, "description"),
    updated: jsxText(block, "updated"),
  }
}
