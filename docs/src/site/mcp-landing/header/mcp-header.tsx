import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import { CourierMark } from "@/site/courier-mark"
import { GitHubMark } from "@/site/github-mark"
import { PageLink } from "@/site/landing/page-link"
import { ThemeSwitch } from "@/site/layout/theme-switch"
import { TopLink } from "@/site/top-link"
import { McpWordmark } from "./mcp-wordmark"

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Scope", href: "#scope" },
  { label: "Policy", href: "#policy" },
  { label: "Confirm", href: "#confirm" },
  { label: "Studio", href: "#record" },
  { label: "Setup", href: "#setup" },
]

/**
 * The bar across the top of the MCP server's page: its name, its
 * sections, the way back to the Courier library, the colour theme, the
 * repository and the guide.
 *
 * @returns The header
 * @example
 * ```tsx
 * <McpHeader />
 * ```
 */
export function McpHeader() {
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-160">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2.5 px-5 min-[560px]:gap-7">
        <TopLink href="/mcp" label="Courier MCP server" className="shrink-0 hover:text-fg">
          <McpWordmark />
        </TopLink>
        <nav aria-label="MCP server" className="hidden gap-5.5 text-nav min-[980px]:flex">
          {NAV.map(({ label, href }) => (
            <a key={href} href={href} className="text-fg-muted hover:text-tone-violet">
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
        <PageLink
          href="/docs/agents/overview"
          className="flex h-7.5 shrink-0 items-center rounded-[7px] bg-fg px-3.25 text-control font-medium whitespace-nowrap text-bg hover:text-bg hover:opacity-86"
        >
          Read the guide
        </PageLink>
      </div>
    </header>
  )
}
