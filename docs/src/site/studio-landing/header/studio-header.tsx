import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import { CourierMark } from "@/site/courier-mark"
import { GitHubMark } from "@/site/github-mark"
import { ThemeSwitch } from "@/site/layout/theme-switch"
import { STUDIO_DEMO_URL } from "@/site/site-url"
import { StudioWordmark } from "./studio-wordmark"

const NAV = [
  { label: "Inspect", href: "#inspect" },
  { label: "Explore", href: "#explore" },
  { label: "Mock", href: "#mock" },
  { label: "Audit", href: "#audit" },
  { label: "Setup", href: "#setup" },
]

/**
 * The bar across the top of Studio's page: its name, its chapters, the
 * way back to the Courier library, the colour theme, the repository and
 * the live demo.
 *
 * @returns The header
 * @example
 * ```tsx
 * <StudioHeader />
 * ```
 */
export function StudioHeader() {
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-160">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2.5 px-5 min-[560px]:gap-7">
        <a href="#top" aria-label="Courier Studio" className="shrink-0 hover:text-fg">
          <StudioWordmark />
        </a>
        <nav aria-label="Studio" className="hidden gap-5.5 text-nav min-[900px]:flex">
          {NAV.map(({ label, href }) => (
            <a key={href} href={href} className="text-fg-muted hover:text-brand">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <Link
          href={"/"}
          className="hidden h-7.5 shrink-0 items-center gap-1.75 rounded-full border border-brand/35 bg-brand-dim pr-2.75 pl-1.75 text-control font-[550] whitespace-nowrap text-brand hover:bg-brand/18 hover:text-brand min-[560px]:flex"
        >
          <span className="grid size-4.5 place-items-center rounded-full bg-brand text-bg">
            <CourierMark width={10} />
          </span>
          Courier library
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
        <ThemeSwitch size="header" />
        <a
          href="https://github.com/NoveraX/courier"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Courier on GitHub"
          className="hidden shrink-0 text-fg-muted hover:text-fg min-[560px]:flex"
        >
          <GitHubMark />
        </a>
        <a
          href={STUDIO_DEMO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7.5 shrink-0 items-center rounded-[7px] bg-fg px-3.25 text-control font-medium whitespace-nowrap text-bg hover:text-bg hover:opacity-86"
        >
          Open demo
        </a>
      </div>
    </header>
  )
}
