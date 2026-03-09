import { CodeBlock } from "@/components/docs/code-block"

import { AnimatedSection } from "./section-animate"

const beforeCode = `// Traditional approach — manual fetch, no types
const res = await fetch("/api/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    method: "GET",
    url: "https://api.example.com/users/1",
    headers: { Authorization: \`Bearer \${token}\` },
  }),
})
if (!res.ok) throw new Error(res.statusText)
const user: unknown = await res.json()`

const afterCode = `// Nexus — typed, zero boilerplate
import { api } from "@/lib/api"

const request = createClientRequest()

const user = await request<User>(api.users.getOne, {
  path: { id: "1" },
})
// user is User — fully typed!`

export function CodeComparison() {
  return (
    <section className="bg-elevated/50 px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Before & <span className="gradient-brand-text">After</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            See how much boilerplate Nexus eliminates while adding full type safety.
          </p>
        </AnimatedSection>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <AnimatedSection delay={0.1}>
            <div className="mb-3 text-sm font-medium text-muted-foreground">Without Nexus</div>
            <CodeBlock code={beforeCode} language="typescript" />
          </AnimatedSection>
          <AnimatedSection delay={0.2}>
            <div className="mb-3 text-sm font-medium text-brand">With Nexus</div>
            <CodeBlock code={afterCode} language="typescript" />
          </AnimatedSection>
        </div>
      </div>
    </section>
  )
}
