import { ArrowRight } from "lucide-react"

import { GithubIcon } from "@/components/icons/github"
import Link from "next/link"

import { CodeBlock } from "@/components/docs/code-block"
import { Button } from "@/components/ui/button"
import { NexusLogo } from "../nexus-logo"
import { InstallBadge } from "./install-badge"
import { AnimatedSection } from "./section-animate"

const heroCode = `import { createClientRequest } from "@noverax/nexus"
import { api } from "@/lib/api"

const request = createClientRequest()

// Fully typed — response, variables, path params
const users = await request<User[]>(api.users.getAll)
const user = await request<User>(api.users.getOne, {
  path: { id: "1" },
})`

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-20 sm:pb-24 sm:pt-28 lg:px-8">
      {/* Background dot grid */}
      <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      {/* Gradient glow behind hero */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 opacity-30 dark:opacity-20"
        aria-hidden="true"
        style={{
          width: "800px",
          height: "500px",
          background:
            "radial-gradient(ellipse at center, oklch(0.65 0.25 270 / 0.4), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: text */}
          <AnimatedSection className="max-w-xl">
            <div className="mb-6 flex items-center gap-4">
              <NexusLogo
                variant="icon"
                width={52}
                height={52}
                gradient
                className="drop-shadow-[0_0_24px_oklch(0.65_0.25_270/0.5)]"
              />
              <InstallBadge />
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Type-Safe HTTP <span className="gradient-brand-text">for Next.js</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Zero boilerplate, full type inference. Proxy & direct modes, React Query integration,
              streaming, uploads — all from a single class definition.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gradient-brand glow-brand text-white">
                <Link href="/docs/quick-start">
                  Get Started
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a
                  href="https://github.com/NoveraX/nexus"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon className="mr-1 h-4 w-4" />
                  GitHub
                </a>
              </Button>
            </div>
          </AnimatedSection>

          {/* Right: code */}
          <AnimatedSection delay={0.15} className="min-w-0">
            <CodeBlock code={heroCode} language="typescript" filename="app/page.tsx" />
          </AnimatedSection>
        </div>
      </div>
    </section>
  )
}
