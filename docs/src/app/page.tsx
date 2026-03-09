import { Architecture } from "@/components/landing/architecture"
import { CodeComparison } from "@/components/landing/code-comparison"
import { FeaturesGrid } from "@/components/landing/features-grid"
import { Footer } from "@/components/landing/footer"
import { Hero } from "@/components/landing/hero"
import { QuickStart } from "@/components/landing/quick-start"
import { WhyNexus } from "@/components/landing/why-nexus"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <Architecture />
      <FeaturesGrid />
      <CodeComparison />
      <WhyNexus />
      <QuickStart />
      <Footer />
    </div>
  )
}
