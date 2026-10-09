import { Activity, BookOpen, Bot, Boxes, Brackets } from "lucide-react"
import type { ComponentType } from "react"

import { CourierMark } from "@/site/courier-mark"
import type { Product } from "@/site/landing/product-pill"

/** A page with the landing pages' header and menu: the library's, or one of its products'. */
export type HeaderPage = "/" | Product["href"]

/** A page's call to action, last in its header and first among the menu's buttons. */
export interface HeaderAction {
  label: string
  /** A section of the page, a page of the site, or another site, which opens in a new tab. */
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

const STUDIO: MenuLink = {
  label: "Courier Studio",
  desc: "Visual debugger for your API layer",
  href: "/studio",
  icon: Activity,
  tone: "blue",
  isNew: true,
}

const MCP: MenuLink = {
  label: "MCP server",
  desc: "Your API as tools for AI agents",
  href: "/mcp",
  icon: Bot,
  tone: "violet",
  isNew: true,
}

const FRAMEWORKS: MenuLink = {
  label: "Frameworks",
  desc: "Next, Nuxt, SvelteKit, Express, React Native…",
  href: "/docs/frameworks/overview",
  icon: Boxes,
  tone: "green",
}

const REFERENCE: MenuLink = {
  label: "API reference",
  desc: "Every export, typed",
  href: "/reference",
  icon: Brackets,
  tone: "teal",
}

/* The docs a page leads to: the library's guides from its page, a product's own from the product's. */
const DOCUMENTATION: Readonly<Record<HeaderPage, MenuLink>> = {
  "/": {
    label: "Documentation",
    desc: "Guides from install to production",
    href: "/docs/introduction",
    icon: BookOpen,
    tone: "violet",
  },
  "/studio": {
    label: "Studio docs",
    desc: "Setup, mocks, audit and the editor",
    href: "/docs/studio/overview",
    icon: BookOpen,
    tone: "violet",
  },
  "/mcp": {
    label: "MCP server docs",
    desc: "Agents in your editor and your app",
    href: "/docs/agents/overview",
    icon: BookOpen,
    tone: "violet",
  },
}

/** The way from a product's page back to the library's, as its header's pill leads. */
export const LIBRARY_LINK: MenuLink = {
  label: "Courier library",
  desc: "Type-safe HTTP for any framework",
  href: "/",
  icon: CourierMark,
  tone: "blue",
}

/**
 * The docs a page's header and menu lead to: the library's guides from the
 * library's page, and from a product's page the product's own.
 *
 * @param page - The page the header is on
 * @returns The docs' link
 * @example
 * ```ts
 * documentationFor("/studio").href // "/docs/studio/overview"
 * ```
 */
export function documentationFor(page: HeaderPage): MenuLink {
  return DOCUMENTATION[page]
}

/**
 * Where the landing pages' menu leads on a narrow screen: Courier's two
 * products with pages of their own first, then the page's docs, the
 * frameworks and the API reference — pages, not sections of the page, as
 * in the header — and from a product's page, the way back to the library
 * last, where the header shows it after its links too.
 *
 * @param page - The page the menu is on
 * @returns The links, in order
 * @example
 * ```ts
 * menuLinksFor("/studio").at(-1)?.href // "/"
 * ```
 */
export function menuLinksFor(page: HeaderPage): readonly MenuLink[] {
  const links = [STUDIO, MCP, documentationFor(page), FRAMEWORKS, REFERENCE]
  return page === "/" ? links : [...links, LIBRARY_LINK]
}
