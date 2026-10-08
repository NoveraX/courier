import type { LucideIcon } from "lucide-react"
import { Activity, BookOpen, Bot, Boxes, Brackets, Columns3, Layers, Scissors } from "lucide-react"

/** A place the landing page's menu leads to. */
export interface MenuLink {
  label: string
  desc: string
  /** A section of this page (`#features`) or a page of the site. */
  href: string
  icon: LucideIcon
  tone: "blue" | "red" | "amber" | "green" | "violet" | "teal"
  isNew?: boolean
}

/**
 * The landing page's menu on a narrow screen, Studio and the MCP server first.
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
    label: "Why courier",
    desc: "The code you get to delete",
    href: "#delete",
    icon: Scissors,
    tone: "red",
  },
  {
    label: "Features",
    desc: "Uploads, streaming, retries, cancel",
    href: "#features",
    icon: Layers,
    tone: "blue",
  },
  {
    label: "Compare",
    desc: "vs fetch, axios, tRPC",
    href: "#compare",
    icon: Columns3,
    tone: "amber",
  },
  {
    label: "Frameworks",
    desc: "Next, Nuxt, SvelteKit, Express…",
    href: "#frameworks",
    icon: Boxes,
    tone: "green",
  },
  {
    label: "Documentation",
    desc: "Guides from install to production",
    href: "/docs/introduction",
    icon: BookOpen,
    tone: "violet",
  },
  {
    label: "API reference",
    desc: "Every export, typed",
    href: "/reference",
    icon: Brackets,
    tone: "teal",
  },
]

/**
 * The sections of the page the header links to on a wide screen.
 *
 * @example
 * ```ts
 * NAV_LINKS.map((l) => l.label) // ["Why", "Features", "Agents", "Compare", "Frameworks", "Docs"]
 * ```
 */
export const NAV_LINKS: readonly { label: string; href: string }[] = [
  { label: "Why", href: "#delete" },
  { label: "Features", href: "#features" },
  { label: "Agents", href: "#agents" },
  { label: "Compare", href: "#compare" },
  { label: "Frameworks", href: "#frameworks" },
  { label: "Docs", href: "/docs/introduction" },
]
