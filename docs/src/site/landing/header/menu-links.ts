import { Activity, BookOpen, Bot, Boxes, Brackets } from "lucide-react"
import type { ComponentType } from "react"

import { CourierMark } from "@/site/courier-mark"
import type { Product } from "@/site/landing/product-pill"

/** A page with the landing pages' header and menu: the library's, or one of its products'. */
export type HeaderPage = "/" | Product["href"]

/** A page's call to action, last in its header and first among the menu's buttons. */
export interface HeaderAction {
  label: string
  /** A page of the site, or another site, which opens in a new tab. */
  href: string
}

/** A place the landing pages' menu leads to. */
export interface MenuLink {
  label: string
  desc: string
  /** A page of the site. */
  href: string
  icon: ComponentType<{ className?: string }>
  tone: "blue" | "red" | "amber" | "green" | "violet" | "teal"
  isNew?: boolean
}

/**
 * Where the landing pages' menu leads on a narrow screen: Courier's two
 * products with pages of their own first, then the docs, the frameworks
 * and the API reference — pages, not sections of the page, as in the
 * header.
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

/** The way from a product's page back to the library's, as its header's pill leads. */
export const LIBRARY_LINK: MenuLink = {
  label: "Courier library",
  desc: "Type-safe HTTP for any framework",
  href: "/",
  icon: CourierMark,
  tone: "blue",
}

/**
 * The menu's links on a page: the same places from every page, the way
 * back to the library last on a product's page — where the header shows it
 * after its links too.
 *
 * @param page - The page the menu is on
 * @returns The links, in order
 * @example
 * ```ts
 * menuLinksFor("/studio").at(-1)?.href // "/"
 * ```
 */
export function menuLinksFor(page: HeaderPage): readonly MenuLink[] {
  return page === "/" ? MENU_LINKS : [...MENU_LINKS, LIBRARY_LINK]
}
