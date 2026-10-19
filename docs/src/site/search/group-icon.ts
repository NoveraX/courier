import type { LucideIcon } from "lucide-react"
import { BookMarked, BookOpen, Clock } from "lucide-react"

import { docsNav } from "@/site/content/docs-nav"
import type { SearchGroup } from "./search-types"
import { RECENT_GROUP } from "./search-view"

/* The API reference's own page is not a section of the navigation; its
   head shows this icon. */
const OWN_ICONS: ReadonlyMap<string, LucideIcon> = new Map([["API reference", BookMarked]])

const NAV_ICONS: ReadonlyMap<string, LucideIcon> = new Map(
  docsNav.map((section) => [section.label, section.icon])
)

/**
 * The icon a group of results is headed with: its section's icon in the
 * navigation, so a result reads as where it sits in the docs.
 *
 * @param group - The group
 * @returns The icon
 * @example
 * ```tsx
 * const Icon = groupIcon(group)
 * ```
 */
export function groupIcon(group: SearchGroup): LucideIcon {
  if (group.id === RECENT_GROUP) return Clock
  return OWN_ICONS.get(group.label) ?? NAV_ICONS.get(group.label) ?? BookOpen
}
