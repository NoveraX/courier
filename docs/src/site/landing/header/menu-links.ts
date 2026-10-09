import type { LucideIcon } from "lucide-react"
import { Activity, BookOpen, Bot, Boxes, Brackets } from "lucide-react"

/** A place the landing page's menu leads to. */
export interface MenuLink {
  label: string
  desc: string
  /** A page of the site. */
  href: string
  icon: LucideIcon
  tone: "blue" | "red" | "amber" | "green" | "violet" | "teal"
  isNew?: boolean
}

/**
 * The landing page's menu on a narrow screen: Courier's two products with
 * pages of their own first, then the docs, the frameworks and the API
 * reference — pages, not sections of this one, as in the header.
 *
 * @example
 * ```ts
 * MENU_LINKS[0].label // "Courier Studio"
 * ```
 */
export const MENU_LINKS: readonly MenuLink[] = [
  {
    label: "Courier Studio",
    desc: "Visual debugger for your API layer",
    href: "/studio",
    icon: Activity,
    tone: "blue",
    isNew: true,
  },
  {
    label: "MCP server",
    desc: "Your API as tools for AI agents",
    href: "/mcp",
    icon: Bot,
    tone: "violet",
    isNew: true,
  },
  {
    label: "Documentation",
    desc: "Guides from install to production",
    href: "/docs/introduction",
    icon: BookOpen,
    tone: "violet",
  },
  {
    label: "Frameworks",
    desc: "Next, Nuxt, SvelteKit, Express, React Native…",
    href: "/docs/frameworks/overview",
    icon: Boxes,
    tone: "green",
  },
  {
    label: "API reference",
    desc: "Every export, typed",
    href: "/reference",
    icon: Brackets,
    tone: "teal",
  },
]
