"use client"

import { useState } from "react"

import { CourierMark } from "@/site/courier-mark"
import { GitHubMark } from "@/site/github-mark"
import { PageLink } from "@/site/landing/page-link"
import { StudioPill } from "@/site/landing/studio-pill"
import { ThemeSwitch } from "@/site/layout/theme-switch"
import { TopLink } from "@/site/top-link"
import { Burger } from "./burger"
import { LandingMenu } from "./landing-menu"
import { NAV_LINKS } from "./menu-links"

/**
 * The bar across the top of the landing page: Courier's mark and version,
 * the sections and the docs with Studio marked new, the menu on a narrow
 * screen, the colour theme, the repository and the way in.
 *
 * @param props - The version of Courier released
 * @returns The header and its menu
 * @example
 * ```tsx
 * <LandingHeader version="0.0.0" />
 * ```
 */
export function LandingHeader({ version }: { version: string }) {
  const [menu, setMenu] = useState(false)
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-160">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2.5 px-5 min-[600px]:gap-7">
        <TopLink href="/" className="flex items-center gap-2.25 text-fg hover:text-fg">
          <CourierMark width={19} />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em]">courier</span>
          <span className="rounded-[5px] border border-line px-1.25 py-0.5 font-mono text-micro text-fg-subtle">
            {version}
          </span>
        </TopLink>
        <nav aria-label="Courier" className="hidden gap-5.5 text-nav min-[940px]:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <PageLink key={href} href={href} className="text-fg-muted hover:text-brand">
              {label}
            </PageLink>
          ))}
          <StudioPill size="nav" />
        </nav>
        <div className="flex-1" />
        <div className="hidden min-[640px]:max-[939px]:flex">
          <StudioPill size="bar" />
        </div>
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
          className="flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line bg-panel text-fg-muted hover:border-line-strong hover:text-fg min-[940px]:hidden"
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
          href="/docs/quick-start"
          className="flex h-7.5 shrink-0 items-center rounded-[7px] bg-fg px-3.25 text-control font-medium whitespace-nowrap text-bg hover:text-bg hover:opacity-86"
        >
          Get started
        </PageLink>
      </div>
      <LandingMenu open={menu} onOpenChange={setMenu} />
    </header>
  )
}
