/**
 * A text cut at the last word that fits a length, with an ellipsis after
 * it — so a card's lines end on a word, never past its edge.
 *
 * @param text - The text
 * @param length - The most characters it may keep
 * @returns The text, whole when it fits
 * @example
 * ```ts
 * clipText("Install the package and define an API", 20) // "Install the package…"
 * ```
 */
export function clipText(text: string, length: number): string {
  if (text.length <= length) return text
  const words = text.slice(0, length + 1)
  const end = words.lastIndexOf(" ")
  const kept = words.slice(0, end > length / 2 ? end : length)
  return `${kept.replace(/[\s,.;:—–-]+$/, "")}…`
}

/**
 * The size a card's headline is set at: large for a short title, smaller
 * as it grows, so the longest still takes two lines at most.
 *
 * @param headline - The headline
 * @returns Its font size, in pixels
 * @example
 * ```ts
 * headlineSize("Quick Start") // 84
 * ```
 */
export function headlineSize(headline: string): number {
  if (headline.length <= 22) return 84
  return headline.length <= 36 ? 72 : 60
}
