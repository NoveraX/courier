import { ArrowRight } from "lucide-react"

import { PageLink } from "@/site/landing/page-link"

/**
 * The MCP server's page's last word: one line, what it costs, and the two
 * ways in.
 *
 * @returns The section
 * @example
 * ```tsx
 * <McpCta />
 * ```
 */
export function McpCta() {
  return (
    <section data-tone="violet" className="pt-[clamp(78px,13vw,130px)]">
      <div className="relative mx-auto max-w-[1200px] px-5 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-15 left-1/2 h-95 w-[860px] max-w-[140vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.14),transparent_65%)]"
        />
        <h2 className="relative mx-auto my-0 max-w-[18ch] text-[clamp(30px,4.4vw,56px)] leading-[1.03] font-semibold tracking-[-0.042em]">
          Give your agents the API you already typed
        </h2>
        <p className="relative mx-auto mt-4.5 mb-0 max-w-[48ch] text-[16px] leading-[1.6] text-fg-muted">
          Free and open source, part of Courier. One definition for your app, your clients and your
          agents.
        </p>
        <div className="relative mt-7.5 flex flex-wrap justify-center gap-2.5">
          <a
            href="#setup"
            className="flex h-11 items-center gap-2 rounded-[10px] bg-fg px-5 text-[14.5px] font-medium text-bg hover:text-bg hover:opacity-86"
          >
            Set it up
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </a>
          <PageLink
            href="/docs/agents/overview"
            className="flex h-11 items-center rounded-[10px] border border-line bg-panel px-5 text-[14.5px] font-medium text-fg hover:border-line-strong hover:text-fg"
          >
            Read the guide
          </PageLink>
        </div>
      </div>
    </section>
  )
}
