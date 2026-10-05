/** A run of one line of Markdown: plain text, code, strong text or a link. */
export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g

function partOf(code?: string, label?: string, href?: string, strong?: string): InlinePart {
  if (code !== undefined) return { kind: "code", text: code }
  if (label !== undefined && href !== undefined) return { kind: "link", text: label, href }
  return { kind: "strong", text: strong ?? "" }
}

/**
 * A line of Markdown as the runs it is made of — the code, links and
 * strong text a page writes inside a sentence, between plain text.
 *
 * @param text - The line
 * @returns Its runs, in order
 * @example
 * ```ts
 * inlineParts("Created with `defineApi()`.")
 * // [{ kind: "text", text: "Created with " }, { kind: "code", text: "defineApi()" }, { kind: "text", text: "." }]
 * ```
 */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push({ kind: "text", text: text.slice(last, match.index) })
    parts.push(partOf(match[1], match[2], match[3], match[4]))
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) })
  return parts
}
