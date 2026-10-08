import { EyeOff, KeyRound, Scale } from "lucide-react"

import { highlightTokens } from "@/site/code/highlight-tokens"
import { SetupTabs, type ShownTarget } from "./setup-tabs"
import { SETUP_TARGETS } from "./setup-targets"

const PRINCIPLES = [
  {
    icon: KeyRound,
    title: "Your credentials stay yours",
    text: "Locally the tools run with your environment; in your app, with what authorize grants.",
  },
  {
    icon: EyeOff,
    title: "Nothing leaves unasked",
    text: "No account, no cloud relay, no telemetry. The server is a process you run.",
  },
  {
    icon: Scale,
    title: "Both eras of MCP",
    text: "2026-07-28, and the 2025 handshake editors speak by default today.",
  },
]

/**
 * How to get the MCP server running, wherever it runs, and what it
 * promises about credentials, data and the protocol.
 *
 * @returns The section
 * @example
 * ```tsx
 * <McpSetupSection />
 * ```
 */
export async function McpSetupSection() {
  const targets: ShownTarget[] = await Promise.all(
    SETUP_TARGETS.map(async (target) => ({
      ...target,
      lines: await highlightTokens(target.code, target.lang),
    }))
  )
  return (
    <section id="setup" data-tone="violet" className="pt-[clamp(77px,13vw,128px)]">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="mb-7.5 flex flex-col gap-3">
          <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-(--tone)">SETUP</p>
          <h2 className="m-0 max-w-[20ch] text-[clamp(27px,3.3vw,40px)] leading-[1.08] font-semibold tracking-[-0.035em]">
            One line in your editor, one handler in your app
          </h2>
          <p className="m-0 max-w-[56ch] text-[16px] leading-[1.6] text-fg-muted">
            Install it in the project, then add it where your agents are. The command serves your
            courier.config.ts; the handler serves your app's registered sources.
          </p>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[8%] inset-x-[10%] bg-[radial-gradient(ellipse_at_center,rgb(var(--tone-rgb)/0.14),transparent_70%)] blur-[30px]"
          />
          <SetupTabs targets={targets} />
        </div>
        <ul className="m-0 mt-12 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6.5 p-0">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-(--tone)" />
              <span className="flex flex-col gap-1">
                <span className="text-callout font-semibold">{title}</span>
                <span className="text-nav leading-[1.55] text-fg-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
