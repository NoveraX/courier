import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const exampleCode = `import { Request, RequestGroup, Method } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string; email: string }

class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Method<User[]> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
  create: Method<User, { name: string; email: string }> = ({ post }) => post()
}

class MyApi extends Request<{ users: Users }> {
  constructor() {
    super({ baseURL: "https://api.example.com", groups: { users: new Users() } })
  }
}`

const usageCode = `// React Query integration — fully typed
const { data, isLoading } = useQuery("myApi", "users:getAll")
//      ^? User[]

const { mutate } = useMutation("myApi", "users:create")
mutate({ name: "Jane", email: "jane@example.com" })
//      ^? { name: string; email: string } — auto-inferred`

export const metadata = docsMetadata("What is Nexus?", "A type-safe HTTP client for Next.js with request grouping, two transport modes, and built-in React Query integration.")

export default async function IntroductionPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="What is Nexus?"
        description="A type-safe HTTP client for Next.js with request grouping, two transport modes, and built-in React Query integration."
      />

      <Prose>
        <p>
          <strong>@noverax/nexus</strong> is an HTTP client library designed specifically for
          Next.js applications. It provides end-to-end type safety from your API definition to your
          React components — without code generation, schema files, or a custom backend.
        </p>

        <p>
          You define your API as TypeScript classes with typed methods. Nexus infers request and
          response types automatically, giving you autocomplete for method names, variables, and
          response shapes.
        </p>

        <h2 id="how-it-works">How It Works</h2>

        <p>
          Define your API structure using <InlineCode>Request</InlineCode> and{" "}
          <InlineCode>RequestGroup</InlineCode> classes. Each method declares its response type and
          variables type using the <InlineCode>{"Method<Response, Variables>"}</InlineCode> generic:
        </p>
      </Prose>

      <CodeBlock code={exampleCode} filename="api/sources.ts" />

      <Prose>
        <p>Then use it in your components with full type inference:</p>
      </Prose>

      <CodeBlock code={usageCode} filename="app/page.tsx" />

      <Prose>
        <h2 id="two-modes">Two Transport Modes</h2>

        <p>
          Nexus supports two modes for executing requests, both sharing the same API definition:
        </p>

        <ul>
          <li>
            <strong>Proxy Mode</strong> — browser sends a POST to your Next.js API route, which
            forwards the request to your backend. Hides secrets, bypasses CORS, and forwards cookies
            automatically.
          </li>
          <li>
            <strong>Direct Mode</strong> — server-side code (RSC, Server Actions) calls the backend
            directly with no proxy hop. Same type safety, zero overhead.
          </li>
        </ul>
      </Prose>

      <Callout variant="tip" title="Same definitions, two modes">
        <p>
          You write your <InlineCode>Request</InlineCode> and <InlineCode>RequestGroup</InlineCode>{" "}
          classes once. Both <InlineCode>createClientRequest</InlineCode> (proxy) and{" "}
          <InlineCode>createDirectRequest</InlineCode> (direct) consume them with identical type
          inference.
        </p>
      </Callout>

      <Prose>
        <h2 id="core-philosophy">Core Philosophy</h2>

        <ul>
          <li>
            <strong>Type safety without codegen</strong> — no generated files, no build steps.
            TypeScript classes are the source of truth.
          </li>
          <li>
            <strong>Zero boilerplate</strong> — define a method signature and Nexus handles
            serialization, path parameters, headers, and error wrapping.
          </li>
          <li>
            <strong>Next.js-first</strong> — App Router, Server Components, Server Actions, and API
            Routes are first-class citizens.
          </li>
          <li>
            <strong>Works with any REST backend</strong> — no custom server required. Connect to
            Express, FastAPI, Rails, or any HTTP API.
          </li>
        </ul>

        <h2 id="comparison">Comparison</h2>

        <p>How Nexus compares to common alternatives:</p>
      </Prose>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-semibold">Feature</th>
              <th className="px-4 py-3 font-semibold">fetch</th>
              <th className="px-4 py-3 font-semibold">axios</th>
              <th className="px-4 py-3 font-semibold">tRPC</th>
              <th className="px-4 py-3 font-semibold text-brand">Nexus</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Type Safety</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3 text-success">Full</td>
              <td className="px-4 py-3 text-success">Full</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">React Query</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3 text-success">Built-in</td>
              <td className="px-4 py-3 text-success">Built-in</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Server Components</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3">No</td>
              <td className="px-4 py-3">Limited</td>
              <td className="px-4 py-3 text-success">First-class</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Request Grouping</td>
              <td className="px-4 py-3">No</td>
              <td className="px-4 py-3">No</td>
              <td className="px-4 py-3">Router</td>
              <td className="px-4 py-3 text-success">RequestGroup</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Upload Progress</td>
              <td className="px-4 py-3">No</td>
              <td className="px-4 py-3 text-success">Yes</td>
              <td className="px-4 py-3">Plugin</td>
              <td className="px-4 py-3 text-success">Built-in</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Path Parameters</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3">Manual</td>
              <td className="px-4 py-3">No</td>
              <td className="px-4 py-3 text-success">Built-in</td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-foreground">Backend Requirement</td>
              <td className="px-4 py-3">Any</td>
              <td className="px-4 py-3">Any</td>
              <td className="px-4 py-3">tRPC server</td>
              <td className="px-4 py-3 text-success">Any REST</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/installation">Installation</Link> — add Nexus to your project
          </li>
          <li>
            <Link href="/docs/quick-start">Quick Start</Link> — build your first request in 5
            minutes
          </li>
          <li>
            <Link href="/docs/project-setup">Project Setup</Link> — recommended file structure and
            patterns
          </li>
        </ul>
      </Prose>
    </div>
  )
}
