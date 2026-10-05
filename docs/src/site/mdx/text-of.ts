import type { ReactNode } from "react"
import { isValidElement } from "react"

/**
 * The text a piece of rendered content reads as: its strings and numbers,
 * those of every element inside it, joined.
 *
 * @param node - The content
 * @returns The text
 * @example
 * ```ts
 * textOf(["Direct mode ", <ModeBadge mode="direct" />]) // "Direct mode "
 * ```
 */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}
