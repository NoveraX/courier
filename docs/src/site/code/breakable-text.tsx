import type { ReactNode } from "react"

/**
 * Text that may also break after each of the given characters — a path
 * between its folders, a call between its members — so that where it is
 * longer than its line, it wraps at a seam rather than mid-word.
 *
 * @param props - The text, and the characters it may break after
 * @returns The text, with a break opportunity after each of them
 * @example
 * ```tsx
 * <BreakableText text="src/composables/useCourierQuery.ts" after="/" />
 * ```
 */
export function BreakableText({ text, after }: { text: string; after: string }): ReactNode {
  const pieces: ReactNode[] = []
  let start = 0
  for (let at = 0; at < text.length; at++) {
    if (!after.includes(text.charAt(at))) continue
    pieces.push(text.slice(start, at + 1), <wbr key={at} />)
    start = at + 1
  }
  pieces.push(text.slice(start))
  return pieces
}
