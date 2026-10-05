import { highlightTokens } from "@/site/code/highlight-tokens"
import { coreVersion } from "@/site/content/version"
import { CompareSection } from "./compare/compare-section"
import { CtaSection } from "./cta-section"
import { FeaturesSection } from "./features/features-section"
import { FrameworksSection } from "./frameworks/frameworks-section"
import { LandingHeader } from "./header/landing-header"
import { HeroSection } from "./hero/hero-section"
import { LandingFooter } from "./landing-footer"
import { BrandMarquee } from "./marquee/brand-marquee"
import { NEW_LINES, OLD_LINES } from "./refactor/refactor-code"
import { RefactorSection } from "./refactor/refactor-section"
import { RouteSection } from "./route/route-section"

/**
 * The landing page: what Courier is, what it replaces, what it does on
 * install, how it compares, the frameworks it serves, and the way in.
 *
 * @returns The page
 * @example
 * ```tsx
 * export default function Page() {
 *   return <LandingPage />
 * }
 * ```
 */
export async function LandingPage() {
  const version = coreVersion()
  const refactorLines = await highlightTokens(
    [...OLD_LINES.map((line) => line.code), ...NEW_LINES].join("\n"),
    "ts"
  )
  return (
    <div data-site="" className="min-h-screen overflow-x-clip bg-bg">
      <LandingHeader version={version} />
      <main id="main-content">
        <HeroSection />
        <BrandMarquee />
        <RefactorSection lines={refactorLines} />
        <FeaturesSection />
        <RouteSection />
        <CompareSection />
        <FrameworksSection />
        <CtaSection />
      </main>
      <LandingFooter version={version} />
    </div>
  )
}
