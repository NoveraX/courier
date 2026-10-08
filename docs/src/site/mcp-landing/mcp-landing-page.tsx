import { coreVersion } from "@/site/content/version"
import { LandingFooter } from "@/site/landing/landing-footer"
import { ChapterSection } from "@/site/studio-landing/chapters/chapter-section"
import { ConfirmViz } from "./chapters/confirm-viz"
import { MCP_CHAPTERS } from "./chapters/mcp-chapters"
import { PolicyViz } from "./chapters/policy-viz"
import { RecordViz } from "./chapters/record-viz"
import { ScopeViz } from "./chapters/scope-viz"
import { McpHeader } from "./header/mcp-header"
import { McpHero } from "./hero/mcp-hero"
import { McpCta } from "./mcp-cta"
import { McpSetupSection } from "./setup/mcp-setup-section"
import { StepsSection } from "./steps/steps-section"

const VISUALS = {
  scope: <ScopeViz />,
  policy: <PolicyViz />,
  confirm: <ConfirmViz />,
  record: <RecordViz />,
} as const

/**
 * The MCP server's page: what it is, the three steps to it, its four
 * chapters each shown running, how to set it up, and the way in.
 *
 * @returns The page
 * @example
 * ```tsx
 * export default function Page() {
 *   return <McpLandingPage />
 * }
 * ```
 */
export function McpLandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <McpHeader />
      <main id="main-content">
        <McpHero />
        <StepsSection />
        {MCP_CHAPTERS.map((chapter) => (
          <ChapterSection key={chapter.id} chapter={chapter}>
            {VISUALS[chapter.id]}
          </ChapterSection>
        ))}
        <McpSetupSection />
        <McpCta />
      </main>
      <LandingFooter version={coreVersion()} />
    </div>
  )
}
