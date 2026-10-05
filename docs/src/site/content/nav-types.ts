import type { LucideIcon } from "lucide-react"

/** A page in the docs' navigation. */
export interface NavItem {
  title: string
  href: string
  description?: string
  badge?: string
  disabled?: boolean
}

/** A section of the docs' navigation and its pages. */
export interface NavSection {
  label: string
  icon: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
}

/** Where a page sits in the navigation. */
export interface NavContext {
  section: NavSection
  item: NavItem
}
