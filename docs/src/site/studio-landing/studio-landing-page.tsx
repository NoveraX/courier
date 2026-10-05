import { AuditViz } from "./chapters/audit-viz"
import { ChapterSection } from "./chapters/chapter-section"
import { CHAPTERS } from "./chapters/chapters"
import { GraphViz } from "./chapters/graph-viz"
import { MockViz } from "./chapters/mock-viz"
import { WaterfallViz } from "./chapters/waterfall-viz"
import { ExtrasSection } from "./extras-section"
import { FrameworkGrid } from "./frameworks/framework-grid"
import { StudioHeader } from "./header/studio-header"
import { StudioHero } from "./hero/studio-hero"
import { SetupSection } from "./setup/setup-section"
import { StudioCta } from "./studio-cta"
import { StudioFooter } from "./studio-footer"

const VISUALS = {
  inspect: <WaterfallViz />,
  explore: <GraphViz />,
  mock: <MockViz />,
  audit: <AuditViz />,
} as const

/**
 * Courier Studio's page: what it is, the frameworks it connects to, its
 * four chapters each running, the rest of its views, how to set it up,
 * and the way in.
 *
 * @returns The page
 * @example
 * ```tsx
 * export default function Page() {
 *   return <StudioLandingPage />
 * }
 * ```
 */
export function StudioLandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <StudioHeader />
      <main id="main-content">
        <StudioHero />
        <FrameworkGrid />
        {CHAPTERS.map((chapter) => (
          <ChapterSection key={chapter.id} chapter={chapter}>
            {VISUALS[chapter.id]}
          </ChapterSection>
        ))}
        <ExtrasSection />
        <SetupSection />
        <StudioCta />
      </main>
      <StudioFooter />
    </div>
  )
}
