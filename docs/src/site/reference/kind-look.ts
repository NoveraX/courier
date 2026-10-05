import type { LucideIcon } from "lucide-react"
import { Box, Braces, FileCode, SquareFunction } from "lucide-react"

import type { ReferenceKind } from "@/site/content/reference"

/** How the reference draws a kind of export: its icon and its colour. */
export interface KindLook {
  icon: LucideIcon
  /** The text colour; tiles and chips tint from it. */
  tone: string
  /** The dot beside its name in the exports list. */
  dot: string
}

/**
 * How each kind of export looks in the reference: functions in the brand
 * colour, types and classes in two of the method colours, a file muted.
 *
 * @example
 * ```ts
 * KIND_LOOK.FUNCTION.tone // "text-brand"
 * ```
 */
export const KIND_LOOK: Readonly<Record<ReferenceKind, KindLook>> = {
  FUNCTION: { icon: SquareFunction, tone: "text-brand", dot: "bg-brand" },
  TYPE: { icon: Braces, tone: "text-verb-put", dot: "bg-verb-put" },
  CLASS: { icon: Box, tone: "text-verb-del", dot: "bg-verb-del" },
  FILE: { icon: FileCode, tone: "text-fg-muted", dot: "bg-fg-subtle" },
}
