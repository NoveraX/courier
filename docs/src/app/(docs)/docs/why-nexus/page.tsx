import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const withoutNexusCode = `// Without Nexus — manual fetch with no type safety
const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/users/\${id}\`, {
  headers: { Authorization: \`Bearer \${token}\` },
})
if (!res.ok) throw new Error("Failed to fetch user")
const user = (await res.json()) as User // manual cast, no guarantee

// Need a proxy? Write your own API route:
// app/api/users/[id]/route.ts — boilerplate for every endpoint
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await fetch(\`\${process.env.API_URL}/users/\${params.id}\`, {
    headers: { Authorization: \`Bearer \${process.env.API_KEY}\` },
  })
  return Response.json(await res.json())
}`

const withNexusCode = `// With Nexus — type-safe, zero boilerplate
const user = await request("myApi")("users:getById", { id: 5 })
//    ^? User — inferred from Method<User, { id: number }>

// Proxy mode? One line in your API route:
// app/api/request/route.ts
export const { POST } = apiRoute(sources)
// Done. Every endpoint works through this single route.`

const boilerplateCode = `// Define once — use everywhere
class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Method<User[]> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
  create: Method<User, CreateUserVars> = ({ post }) => post()
  update: Method<User, UpdateUserVars> = ({ patch }) => patch(":id")
  remove: Method<void, { id: number }> = ({ del }) => del(":id")
}

// Client component — proxy mode
const user = await request("myApi")("users:getById", { id: 5 })

// Server component — direct mode, same types
const user = await directRequest("myApi")("users:getById", { id: 5 })

// React Query — same types again
const { data } = useQuery("myApi", "users:getById", { variables: { id: 5 } })`

const reactQueryCode = `// Traditional React Query — manual setup per endpoint
const { data } = useQuery({
  queryKey: ["users", id],
  queryFn: async () => {
    const res = await fetch(\`/api/users/\${id}\`)
    if (!res.ok) throw new Error("fetch failed")
    return res.json() as Promise<User>
  },
})

// With Nexus — one line, fully typed
const { data } = useQuery("myApi", "users:getById", { variables: { id } })
//      ^? User`

export const metadata = docsMetadata(
  "Why Nexus?",
  "The problems Nexus solves: boilerplate, type safety, proxy complexity, and scattered API logic in Next.js applications."
)

export default async function WhyNexusPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Why Nexus?"
        description="The problems Nexus solves: boilerplate, type safety, proxy complexity, and scattered API logic in Next.js applications."
      />

      <Prose>
        <p>
          Building a Next.js app that talks to a REST API sounds simple — until you need type
          safety, a proxy layer, cookie forwarding, error handling, upload progress, and React Query
          integration. Each of these adds boilerplate, and without a unified approach, your API
          logic scatters across dozens of files.
        </p>

        <p>
          Nexus solves this by giving you a single, typed API definition that works across client
          components, server components, and server actions — with zero code generation.
        </p>

        <h2 id="the-problem">The Problem</h2>

        <p>A typical Next.js + REST API setup requires you to:</p>

        <ol>
          <li>
            Write <InlineCode>fetch</InlineCode> calls with manual URL construction, headers, and
            error handling
          </li>
          <li>Cast response types manually with no runtime guarantee</li>
          <li>Create a separate API route for every endpoint you want to proxy</li>
          <li>Duplicate type annotations between your fetch logic and your components</li>
          <li>Wire up React Query with custom query keys and fetch functions for each endpoint</li>
        </ol>

        <p>This leads to fragile, repetitive code that is hard to maintain:</p>
      </Prose>

      <CodeBlock code={withoutNexusCode} language="typescript" filename="Without Nexus" />

      <Prose>
        <p>With Nexus, the same functionality requires far less code and is fully type-safe:</p>
      </Prose>

      <CodeBlock code={withNexusCode} language="typescript" filename="With Nexus" />

      <Prose>
        <h2 id="define-once">Define Once, Use Everywhere</h2>

        <p>
          The core idea behind Nexus is that you define your API structure <strong>once</strong>{" "}
          using <InlineCode>Request</InlineCode> and <InlineCode>RequestGroup</InlineCode> classes.
          Every method declares its response type and variables type through the{" "}
          <InlineCode>{"Method<R, V>"}</InlineCode> generic. From that single definition, Nexus
          gives you:
        </p>

        <ul>
          <li>
            <strong>Proxy mode</strong> — browser requests through{" "}
            <InlineCode>createClientRequest</InlineCode>
          </li>
          <li>
            <strong>Direct mode</strong> — server requests through{" "}
            <InlineCode>createDirectRequest</InlineCode>
          </li>
          <li>
            <strong>React Query</strong> — hooks through <InlineCode>createQueryRequest</InlineCode>
          </li>
        </ul>

        <p>All three share the same types, autocomplete, and validation:</p>
      </Prose>

      <CodeBlock
        code={boilerplateCode}
        language="typescript"
        filename="One definition, three modes"
      />

      <Callout variant="tip" title="No code generation">
        <p>
          Unlike tRPC or GraphQL codegen, Nexus uses plain TypeScript classes as the source of
          truth. There are no generated files, no build steps, and no schema syncing. Rename a
          method, and TypeScript catches every broken call site instantly.
        </p>
      </Callout>

      <Prose>
        <h2 id="single-proxy-route">One Proxy Route for Everything</h2>

        <p>
          Without Nexus, proxying requests means creating an API route for every backend endpoint.
          With Nexus, a single <InlineCode>apiRoute(sources)</InlineCode> call handles all endpoints
          through one <InlineCode>POST /api/request</InlineCode> route. It automatically:
        </p>

        <ul>
          <li>Validates the request origin (CSRF protection)</li>
          <li>Forwards whitelisted headers and cookies</li>
          <li>Routes to the correct source, group, and method</li>
          <li>Handles errors with proper HTTP status codes</li>
          <li>Supports file uploads and multipart encoding</li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="react-query">React Query Without the Boilerplate</h2>

        <p>
          React Query is powerful, but wiring it up for every endpoint is tedious. You need query
          keys, fetch functions, type annotations, and error handling — repeated per endpoint. Nexus
          wraps React Query with full type inference:
        </p>
      </Prose>

      <CodeBlock code={reactQueryCode} language="typescript" filename="React Query comparison" />

      <Prose>
        <h2 id="key-benefits">Key Benefits</h2>
      </Prose>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-semibold">Problem</th>
              <th className="px-4 py-3 font-semibold text-brand">Nexus Solution</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Manual type casting</td>
              <td className="px-4 py-3">
                End-to-end inference from <InlineCode>{"Method<R, V>"}</InlineCode>
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">API route per endpoint</td>
              <td className="px-4 py-3">
                Single <InlineCode>apiRoute(sources)</InlineCode> handles all
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Scattered fetch logic</td>
              <td className="px-4 py-3">Centralized in Request/RequestGroup classes</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">
                Duplicate client/server code
              </td>
              <td className="px-4 py-3">One definition, proxy + direct modes</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">React Query boilerplate</td>
              <td className="px-4 py-3">
                <InlineCode>useQuery</InlineCode> / <InlineCode>useMutation</InlineCode> with auto
                inference
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Upload progress tracking</td>
              <td className="px-4 py-3">Built-in XHR fallback with progress callback</td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-foreground">CORS and cookie issues</td>
              <td className="px-4 py-3">Proxy mode handles same-origin + cookie forwarding</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Prose>
        <h2 id="who-is-it-for">Who is it for?</h2>

        <p>Nexus is designed for teams and projects that:</p>

        <ul>
          <li>Use Next.js App Router with a separate REST backend</li>
          <li>Want type safety without adopting tRPC or GraphQL</li>
          <li>Need both client-side and server-side data fetching</li>
          <li>Value DX — autocomplete, compile-time errors, minimal boilerplate</li>
        </ul>
      </Prose>

      <Callout variant="info" title="Works with any REST backend">
        <p>
          Nexus does not require a specific backend framework. It works with Express, FastAPI,
          Rails, Go, or any HTTP API that returns JSON. Your backend does not need any
          Nexus-specific setup.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/architecture">Architecture</Link> — understand how Nexus works under
            the hood
          </li>
          <li>
            <Link href="/docs/installation">Installation</Link> — add Nexus to your project
          </li>
          <li>
            <Link href="/docs/quick-start">Quick Start</Link> — build your first request in 5
            minutes
          </li>
        </ul>
      </Prose>
    </div>
  )
}
