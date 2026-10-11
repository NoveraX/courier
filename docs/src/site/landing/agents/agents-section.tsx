import { ArrowRight, Bot } from "lucide-react"
import Link from "next/link"

import { CodeLines } from "@/site/code/code-lines"
import { highlightTokens } from "@/site/code/highlight-tokens"
import { InstallButton } from "@/site/landing/install-button"
import { START_COMMAND } from "@/site/landing/start-command"
import { TerminalSession } from "./terminal-session"

const AGENT_CODE = [
  "cancel: endpoint",
  '  .post(":id/cancel")',
  "  .variables(z.object({ id: z.string() }))",
  "  .agent({",
  '    description: "Cancel an order that has not shipped yet",',
  '    access: "destructive",',
  "  })",
].join("\n")

const AGENTS_DO = [
  "Only the endpoints you offer — every other one stays out of reach",
  "Arguments and answers typed from the schemas you already wrote",
  "Every call through your middleware: auth, limits, audit",
  "A person confirms anything that cannot be undone",
  "Every agent call in Studio, beside your app's own",
]

/**
 * Courier's MCP server on the landing page: one definition, now also an
 * agent's tools — what it guarantees and the line that turns it on, beside
 * an agent at work in its terminal, with Studio watching.
 *
 * @returns The section
 * @example
 * ```tsx
 * <AgentsSection />
 * ```
 */
export async function AgentsSection() {
  const code = await highlightTokens(AGENT_CODE, "ts")
  return (
    <section id="agents" data-tone="violet" className="relative pt-26">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-10 left-1/2 h-140 w-[1100px] max-w-[150vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.11),transparent_65%)]"
      />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] text-(--tone)">
            <Bot aria-hidden="true" className="size-3.5" />
            MCP SERVER
          </p>
          <h2 className="mt-3.5 mb-0 max-w-[15ch] text-[clamp(28px,3.4vw,42px)] leading-[1.06] font-semibold tracking-[-0.035em]">
            Your API, in every agent's hands
          </h2>
          <p className="mt-4 mb-5.5 max-w-[50ch] text-[15.5px] leading-[1.6] text-fg-muted">
            Mark an endpoint <code className="font-mono text-[14px] text-fg">.agent()</code> and
            Claude Code, Cursor or any MCP client can call it — typed from your schemas, run through
            your middleware, and recorded in Studio.
          </p>
          <ul className="m-0 grid list-none gap-2.25 p-0">
            {AGENTS_DO.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-callout text-fg-muted">
                <span aria-hidden="true" className="pt-0.5 text-[12px] text-(--tone)">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-5.5 overflow-x-auto rounded-[10px] border border-line bg-bg-subtle">
            <CodeLines
              lines={code}
              className="m-0 px-4 py-3.5 text-label leading-[1.75] text-code-plain"
            />
          </div>
          <div className="mt-5.5 flex flex-wrap items-center gap-3">
            <Link
              href="/mcp"
              className="flex h-10.5 items-center gap-2 rounded-[9px] bg-fg px-4.5 text-[14px] font-medium text-bg hover:text-bg hover:opacity-86"
            >
              Explore the MCP server
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
            <InstallButton look="hero" command={`${START_COMMAND} --mcp`} />
          </div>
        </div>
        <div className="relative min-w-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[8%] inset-x-[4%] bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.18),transparent_70%)] blur-[34px]"
          />
          <TerminalSession />
        </div>
      </div>
    </section>
  )
}
