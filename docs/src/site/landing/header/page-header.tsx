"use client"

import { type ReactNode, useRef, useState } from "react"

import { GitHubMark } from "@/site/github-mark"
import { PageLink } from "@/site/landing/page-link"
import { PRODUCTS, ProductPill } from "@/site/landing/product-pill"
import { ThemeSwitch } from "@/site/layout/theme-switch"
import { TopLink } from "@/site/top-link"
import { Burger } from "./burger"
import { LandingMenu } from "./landing-menu"
import { LibraryPill } from "./library-pill"
import { documentationFor, type HeaderAction, type HeaderPage } from "./menu-links"

interface PageHeaderProps {
  /** The page it is on: the library's, or one of its products'. */
  page: HeaderPage
  /** The page's name at the left, which takes the reader back to its top. */
  brand: ReactNode
  /** What a screen reader calls the name, when it does not say. */
  brandLabel?: string
  /** The page's call to action, last in the bar and first among the menu's buttons. */
  action: HeaderAction
  /** The install command the menu offers to copy. */
  install: string
}

/**
 * The bar across the top of the library's page and its products' pages
 * alike: the page's name; its docs — the library's guides, or on a
 * product's page the product's own — and Courier's two products, the one
 * it is on marked; on a product's page, the way back to the library; the
 * menu on a narrow screen; the colour theme, the repository and the page's
 * call to action.
 *
 * @param props - The page, its name, its call to action and its install command
 * @returns The header and its menu
 * @example
 * ```tsx
 * <PageHeader
 *   page="/studio"
 *   brand={<StudioWordmark />}
 *   brandLabel="Courier Studio"
 *   action={{ label: "Open demo", href: STUDIO_DEMO_URL }}
 *   install={STUDIO_INSTALL}
 * />
 * ```
 */
export function PageHeader({ page, brand, brandLabel, action, install }: PageHeaderProps) {
  const [menu, setMenu] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-160">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2.5 px-5 min-[600px]:gap-7">
        <TopLink
          href={page}
          label={brandLabel}
          className="flex shrink-0 items-center gap-2.25 text-fg hover:text-fg"
        >
          {brand}
        </TopLink>
        <nav aria-label="Courier" className="hidden items-center gap-4.5 text-nav min-[820px]:flex">
          <PageLink href={documentationFor(page).href} className="text-fg-muted hover:text-brand">
            Docs
          </PageLink>
          {PRODUCTS.map((product) => (
            <ProductPill key={product.href} product={product} current={product.href === page} />
          ))}
        </nav>
        <div className="flex-1" />
        {page !== "/" && <LibraryPill className="hidden min-[820px]:flex" />}
        <button
          ref={menuButton}
          type="button"
          aria-label="Menu"
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
          className="flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line bg-panel text-fg-muted hover:border-line-strong hover:text-fg min-[820px]:hidden"
        >
          <Burger open={menu} />
        </button>
        <div className="hidden min-[640px]:block">
          <ThemeSwitch size="header" />
        </div>
        <a
          href="https://github.com/NoveraX/courier"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Courier on GitHub"
          className="hidden text-fg-muted hover:text-fg min-[480px]:flex"
        >
          <GitHubMark />
        </a>
        <PageLink
          href={action.href}
          className="flex h-7.5 shrink-0 items-center rounded-[7px] bg-fg px-3.25 text-control font-medium whitespace-nowrap text-bg hover:text-bg hover:opacity-86"
        >
          {action.label}
        </PageLink>
      </div>
      <LandingMenu
        open={menu}
        onOpenChange={setMenu}
        page={page}
        action={action}
        install={install}
        returnTo={menuButton}
      />
    </header>
  )
}
