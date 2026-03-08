import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { CodeBlock } from "@/components/docs/code-block"
import { Button } from "@/components/ui/button"

import { AnimatedSection } from "./section-animate"

const installCode = `npm install @noverax/nexus`

const defineCode = `import { Request, RequestGroup } from "@noverax/nexus"

class Users extends RequestGroup {
  prefix = "users"
  getAll = new Request({ method: "GET" })
  getOne = new Request({ method: "GET", path: ":id" })
  create = new Request({ method: "POST" })
}

export const api = { users: new Users() }`

const useCode = `import { createClientRequest } from "@noverax/nexus"
import { api } from "@/lib/api"

const request = createClientRequest()

// GET /users — returns User[]
const users = await request<User[]>(api.users.getAll)

// POST /users — create a new user
const newUser = await request<User>(api.users.create, {
  body: { name: "Alice", email: "alice@example.com" },
})`

const steps = [
  { number: 1, label: "Install", code: installCode, language: "bash" },
  { number: 2, label: "Define your API", code: defineCode, language: "typescript", filename: "lib/api.ts" },
  { number: 3, label: "Use anywhere", code: useCode, language: "typescript", filename: "app/page.tsx" },
]

export function QuickStart() {
  return (
    <section className="bg-elevated/50 px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <AnimatedSection className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Up and Running in{" "}
            <span className="gradient-brand-text">3 Steps</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            From install to your first typed request in under a minute.
          </p>
        </AnimatedSection>

        <div className="mt-12 space-y-10">
          {steps.map((step, i) => (
            <AnimatedSection key={step.number} delay={i * 0.1}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-brand text-sm font-bold text-brand">
                  {step.number}
                </div>
                <h3 className="text-base font-semibold">{step.label}</h3>
              </div>
              <div className="mt-3 pl-11">
                <CodeBlock
                  code={step.code}
                  language={step.language}
                  filename={step.filename}
                />
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection delay={0.35} className="mt-12 text-center">
          <Button asChild size="lg" className="gradient-brand glow-brand text-white">
            <Link href="/basic">
              Read Full Guide
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </AnimatedSection>
      </div>
    </section>
  )
}
