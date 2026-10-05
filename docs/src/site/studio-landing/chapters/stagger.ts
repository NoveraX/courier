import type { CSSProperties } from "react"

/**
 * The style that staggers a visual's part: its place, which delays its
 * entrance by a step per place.
 *
 * @param at - The part's place
 * @returns The style
 * @example
 * ```tsx
 * <span data-a="pop" style={stagger(2)} />
 * ```
 */
export function stagger(at: number): CSSProperties & Record<"--i", number> {
  return { "--i": at }
}
