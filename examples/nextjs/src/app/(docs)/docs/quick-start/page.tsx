import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { StepList } from "@/components/docs/step-list"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const step1Code = `import { Request, RequestGroup, Method } from "@noverax/nexus/RequestClass"

// 1. Define response & request types
type User = { id: number; name: string; email: string; role: string }
type UserList = { data: User[]; total: number }

// 2. Create a RequestGroup with typed methods
class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Method<UserList, { page?: number; limit?: number }> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
  create: Method<User, { name: string; email: string; role: string }> = ({ post }) => post()
  update: Method<User, { id: number; name: string; email: string }> = ({ put }) => put(":id")
  remove: Method<null, { id: number }> = ({ del }) => del(":id")
}

// 3. Create a Request with groups and base URL
const groups = { users: new Users() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
    })
  }
}

// 4. Export sources object
export const sources = { myApi: new MyApi() }
export type Sources = typeof sources`

const step2aCode = `// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus/next/apiRoute"
import { sources } from "@/api/sources"

export const { POST } = apiRoute(sources)`

const step2bCode = `// lib/request.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api/sources"

export const { useQuery, useMutation, request } = createQueryRequest<Sources>()`

const step3aCode = `// app/api/request/route.ts  — already done in Step 2

// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api/sources"

export const directRequest = createDirectRequest(sources)`

const step4proxyCode = `"use client"

import { useQuery, useMutation } from "@/lib/request"

export default function UsersPage() {
  // Auto-fetches on mount, returns typed data
  const { data, isLoading } = useQuery("myApi", "users:getAll", {
    variables: { page: 1, limit: 10 },
  })

  // Mutation for creating users
  const { mutate, isPending } = useMutation("myApi", "users:create", {
    onSuccess: (user) => {
      console.log("Created:", user.name) // ← fully typed
    },
  })

  if (isLoading) return <p>Loading…</p>

  return (
    <div>
      <h1>Users ({data?.total})</h1>
      <ul>
        {data?.data.map((user) => (
          <li key={user.id}>{user.name} — {user.email}</li>
        ))}
      </ul>
      <button
        onClick={() => mutate({ name: "Jane", email: "jane@test.com", role: "user" })}
        disabled={isPending}
      >
        Add User
      </button>
    </div>
  )
}`

const step4directCode = `// app/dashboard/page.tsx — React Server Component
import { directRequest } from "@/lib/direct-request"

export default async function DashboardPage() {
  const users = await directRequest("myApi")("users:getAll", { page: 1, limit: 5 })

  return (
    <div>
      <h1>Dashboard ({users.total} users)</h1>
      <ul>
        {users.data.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  )
}`

export const metadata = docsMetadata("Quick Start", "Define your API, set up the transport, and make your first typed request — in 4 steps.")

export default async function QuickStartPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Quick Start"
        description="Define your API, set up the transport, and make your first typed request — in 4 steps."
      />

      <StepList
        steps={[
          {
            title: "Define your API sources",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  Create a file with your API definition. Each <InlineCode>RequestGroup</InlineCode>{" "}
                  organizes related endpoints under a URL prefix, and each method declares its
                  response and variables types:
                </p>
                <CodeBlock code={step1Code} filename="api/sources.ts" />
                <Callout variant="info" title="Path parameters">
                  <p>
                    The <InlineCode>{":id"}</InlineCode> syntax in{" "}
                    <InlineCode>{'get(":id")'}</InlineCode> automatically extracts{" "}
                    <InlineCode>id</InlineCode> from the variables and inserts it into the URL. The
                    remaining variables are sent as query params (GET) or body (POST/PUT/PATCH).
                  </p>
                </Callout>
              </div>
            ),
          },
          {
            title: "Set up the transport",
            content: (
              <div className="mt-4 space-y-6">
                <div className="space-y-3">
                  <p className="font-medium text-foreground">
                    Proxy mode (browser → API route → backend):
                  </p>
                  <p>
                    Create an API route that forwards browser requests to your backend, then create
                    a client with React Query hooks:
                  </p>
                  <CodeBlock code={step2aCode} filename="app/api/request/route.ts" />
                  <CodeBlock code={step2bCode} filename="lib/request.ts" />
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-foreground">Direct mode (server → backend):</p>
                  <p>For Server Components and Server Actions, create a direct request client:</p>
                  <CodeBlock code={step3aCode} filename="lib/direct-request.ts" />
                </div>

                <Callout variant="tip" title="Use both modes together">
                  <p>
                    Most apps use proxy mode for client components and direct mode for server
                    components. Both share the same source definitions.
                  </p>
                </Callout>
              </div>
            ),
          },
          {
            title: "Use in components",
            content: (
              <div className="mt-4 space-y-6">
                <div className="space-y-3">
                  <p className="font-medium text-foreground">
                    Client component (proxy + React Query):
                  </p>
                  <CodeBlock code={step4proxyCode} filename="app/users/page.tsx" />
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-foreground">Server component (direct mode):</p>
                  <CodeBlock code={step4directCode} filename="app/dashboard/page.tsx" />
                </div>
              </div>
            ),
          },
          {
            title: "Run your app",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  Start your backend server and Next.js dev server. The proxy route handles
                  serialization, CORS, and cookie forwarding automatically.
                </p>
                <Callout variant="warning" title="Don't forget your backend">
                  <p>
                    Nexus doesn&apos;t replace your backend — it connects to any REST API. Make sure
                    your backend is running at the URL specified in <InlineCode>API_URL</InlineCode>
                    .
                  </p>
                </Callout>
              </div>
            ),
          },
        ]}
      />

      <Prose>
        <h2 id="whats-happening">What&apos;s happening under the hood</h2>

        <p>When you call a query like this:</p>
      </Prose>

      <CodeBlock
        code={`useQuery("myApi", "users:getById", { variables: { id: 5 } })`}
        language="typescript"
      />

      <Prose>
        <ol>
          <li>
            Nexus parses <InlineCode>{'"users:getById"'}</InlineCode> into group{" "}
            <InlineCode>users</InlineCode> and method <InlineCode>getById</InlineCode>
          </li>
          <li>
            In proxy mode, it POSTs to <InlineCode>/api/request</InlineCode> with the source, group,
            query, and variables
          </li>
          <li>
            The API route finds the <InlineCode>Users</InlineCode> group, calls{" "}
            <InlineCode>getById</InlineCode> with an <InlineCode>Instance</InlineCode> that wraps ky
          </li>
          <li>
            The <InlineCode>{":id"}</InlineCode> path parameter is extracted from variables, and the
            request goes to <InlineCode>GET /users/5</InlineCode>
          </li>
          <li>The typed response flows back through React Query to your component</li>
        </ol>

        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/project-setup">Project Setup</Link> — recommended file structure for
            production
          </li>
          <li>
            <Link href="/basic">Examples</Link> — interactive demos of every feature
          </li>
        </ul>
      </Prose>
    </div>
  )
}
