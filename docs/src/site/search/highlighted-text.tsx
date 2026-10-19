import type { HighlightPart } from "./highlight-parts"

function keyedParts(parts: readonly HighlightPart[]): { key: number; part: HighlightPart }[] {
  const keyed: { key: number; part: HighlightPart }[] = []
  let offset = 0
  for (const part of parts) {
    keyed.push({ key: offset, part })
    offset += part.text.length
  }
  return keyed
}

/**
 * A result's text with the words that matched what was typed marked, in
 * the site's accent. Drawn as text alone: nothing in it is read as markup.
 *
 * @param props - The text's runs
 * @returns The text
 * @example
 * ```tsx
 * <HighlightedText parts={option.title} />
 * ```
 */
export function HighlightedText({ parts }: { parts: readonly HighlightPart[] }) {
  return keyedParts(parts).map(({ key, part }) =>
    part.matched ? (
      <mark key={key} className="rounded-[3px] bg-brand-dim text-brand">
        {part.text}
      </mark>
    ) : (
      <span key={key}>{part.text}</span>
    )
  )
}
