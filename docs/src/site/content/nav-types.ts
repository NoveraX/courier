/** A section of the docs' navigation by a name that stays when its label changes. */
export type SectionId =
  | "introduction"
  | "getting-started"
  | "core-concepts"
  | "frameworks"
  | "react-query"
  | "middleware"
  | "validation"
  | "proxy-mode"
  | "server-side"
  | "agents"
  | "security"
  | "advanced"
  | "testing"
  | "studio"
  | "deployment"
  | "api"
  | "examples"

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
  id: SectionId
  label: string
  items: NavItem[]
  defaultOpen?: boolean
}

/** Where a page sits in the navigation. */
export interface NavContext {
  section: NavSection
  item: NavItem
}
