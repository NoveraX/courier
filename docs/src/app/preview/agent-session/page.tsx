import type { Metadata } from "next"

import { coreVersion } from "@/site/content/version"
import { AgentSession } from "@/site/landing/agents/agent-session"
import { AgentsSection } from "@/site/landing/agents/agents-section"
import { TerminalSession } from "@/site/landing/agents/terminal-session"
import { LandingHeader } from "@/site/landing/header/landing-header"

export const metadata: Metadata = {
  title: { absolute: "Agent session — terminal variant" },
  robots: { index: false, follow: false },
}

/**
 * The terminal variant of the agent session, shown where it would stand —
 * in the landing page's agents section and at the width of the MCP
 * server's page — beside the session the pages show now, for review before
 * it takes that session's place.
 *
 * @returns The page
 */
export default function Page() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg pb-24">
      <LandingHeader version={coreVersion()} />
      <main>
        <AgentsSection session={<TerminalSession />} />
        <section className="mx-auto mt-24 max-w-[880px] px-5">
          <p className="m-0 mb-4 font-mono text-[11px] tracking-[0.1em] text-fg-subtle">
            AT THE WIDTH OF THE MCP SERVER'S PAGE
          </p>
          <TerminalSession />
        </section>
        <section className="mx-auto mt-24 max-w-[600px] px-5">
          <p className="m-0 mb-4 font-mono text-[11px] tracking-[0.1em] text-fg-subtle">
            THE SESSION THE PAGES SHOW NOW
          </p>
          <AgentSession />
        </section>
      </main>
    </div>
  )
}
