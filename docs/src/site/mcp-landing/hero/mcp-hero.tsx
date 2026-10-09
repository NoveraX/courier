import { ArrowRight, Bot } from "lucide-react"

import { TerminalSession } from "@/site/landing/agents/terminal-session"
import { InstallButton } from "@/site/landing/install-button"
import { PageLink } from "@/site/landing/page-link"

/** The command that installs the MCP server. */
export const MCP_INSTALL = "npm i @noverax/courier-mcp"

/**
 * The top of the MCP server's page: what it is in one line, the guide and
 * its install command, and an agent at work on an API through it, in its
 * terminal, with Studio recording each call.
 *
 * @returns The section
 * @example
 * ```tsx
 * <McpHero />
 * ```
 */
export function McpHero() {
  return (
    <section data-tone="violet" className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-55 left-1/2 h-175 w-[1200px] max-w-[160vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.14),transparent_62%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pt-[clamp(48px,9vw,80px)] text-center">
        <div className="inline-flex h-7 animate-rise items-center gap-2.25 rounded-full border border-line bg-panel px-3 text-small text-fg-muted">
          <Bot aria-hidden="true" className="size-3.25 text-(--tone)" />
          Model Context Protocol
          <span className="max-[480px]:hidden">· 2026-07-28 and the 2025 handshake</span>
        </div>
        <h1 className="mx-auto mt-6 mb-0 max-w-[15ch] animate-rise text-[clamp(40px,6vw,76px)] leading-[1.01] font-semibold tracking-[-0.045em]">
          Your API, as tools for <span className="text-(--tone)">AI agents</span>
        </h1>
        <p className="mx-auto mt-5.5 mb-0 max-w-[60ch] animate-rise text-[clamp(15.5px,1.5vw,18.5px)] leading-[1.58] text-fg-muted">
          Mark the endpoints an agent may call. Courier serves them over MCP to Claude Code, Cursor
          and every MCP client — typed from your schemas, run through your middleware, and confirmed
          by a person before anything is undone.
        </p>
        <div className="mt-8 flex animate-rise flex-wrap justify-center gap-2.5">
          <PageLink
            href="/docs/agents/overview"
            className="flex h-11 items-center gap-2 rounded-[10px] bg-fg px-5 text-[14.5px] font-medium text-bg hover:text-bg hover:opacity-86"
          >
            Read the guide
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </PageLink>
          <InstallButton look="studio" command={MCP_INSTALL} />
        </div>
      </div>
      <div className="relative mx-auto mt-14 max-w-[880px] px-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-17.5 left-1/2 h-60 w-4/5 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.2),transparent_70%)] blur-[24px]"
        />
        <div className="relative animate-rise">
          <TerminalSession />
        </div>
      </div>
    </section>
  )
}
