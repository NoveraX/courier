import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { createDirectRequest } from "@noverax/nexus/direct"

const request = createDirectRequest<Sources>(sources, defaults?)`

const defaultsTypeCode = `type DirectRequestDefaults = {
  timeout?: number
  headers?: Record<string, string>
  onError?: (error: HTTPError) => void | Promise<void>
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const sourcesTypeCode = `type Sources = Record<string, Datasource<GroupsRecord | undefined>>`

const returnTypeCode = `// Direct mode returns Partial<HttpResponse<R>> — includes status, headers, and data
type HttpResponse<T = unknown> = {
  status: number
  headers: Headers
  data: T
}

// Return type: Promise<Partial<HttpResponse<R>>>`

const basicUsageCode = `import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api/sources"

const request = createDirectRequest(sources, {
  timeout: 10000,
})

// Usage: request(source)(query, variables?, context?)
const result = await request("api")("users:getAll")
const user = await request("api")("users:getById", { id: "123" })`

const contextCode = `import { headers } from "next/headers"

// Pass Next.js context for cookie/header forwarding
const result = await request("api")(
  "users:getProfile",
  undefined,               // no variables
  { headers: await headers() },  // context with headers
)

// With variables AND context
const user = await request("api")(
  "users:getById",
  { id: "123" },           // variables
  { headers: await headers() },  // context
)`

const rscCode = `// app/users/page.tsx — React Server Component
import { request } from "@/api/direct"

export default async function UsersPage() {
  const result = await request("api")("users:getAll")

  return (
    <ul>
      {result.data?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}`

const actionCode = `// app/users/actions.ts — Server Action
"use server"

import { request } from "@/api/direct"
import { revalidatePath } from "next/cache"

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string

  await request("api")("users:create", { name })

  revalidatePath("/users")
}`

const defaultsCode = `const request = createDirectRequest(sources, {
  // Request timeout in milliseconds
  timeout: 15000,

  // Default headers for every request
  headers: {
    "X-Internal-Service": "nexus-app",
  },

  // Global error handler
  onError: (error) => {
    console.error(\`[Direct] HTTP \${error.status}:\`, error.data)
  },

  // Global success handler
  onSuccess: (data) => {
    console.log("[Direct] Success:", data)
  },
})`

const contextTypeCode = `type Context = {
  req?: NextRequest
  res?: NextResponse
  headers?: Headers
}`

export const metadata = docsMetadata(
  "createDirectRequest",
  "Factory function that creates a typed request function for server-side direct HTTP calls — no proxy hop needed."
)

export default async function CreateDirectRequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="createDirectRequest"
        description="Factory function that creates a typed request function for server-side direct HTTP calls — no proxy hop needed."
        badge="Server"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock
        code={`import { createDirectRequest } from "@noverax/nexus/direct"`}
        language="typescript"
      />

      <Prose>
        <h2 id="signature">Signature</h2>
        <p>
          <InlineCode>createDirectRequest</InlineCode> takes your source definitions and optional
          defaults, returning a curried <InlineCode>RequestFn</InlineCode> function. Unlike{" "}
          <InlineCode>createClientRequest</InlineCode>, direct mode calls the backend directly
          without going through a proxy API route.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} language="typescript" />

      <Prose>
        <h2 id="parameters">Parameters</h2>
        <h3 id="sources">sources</h3>
        <p>
          A record of <InlineCode>Request</InlineCode> data source definitions. This is the same
          object you pass to <InlineCode>apiRoute</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={sourcesTypeCode} language="typescript" />

      <Prose>
        <h3 id="defaults">defaults</h3>
        <p>Optional default settings applied to every request.</p>
      </Prose>

      <CodeBlock code={defaultsTypeCode} language="typescript" />

      <Prose>
        <ul>
          <li>
            <InlineCode>timeout</InlineCode> — request timeout in milliseconds.
          </li>
          <li>
            <InlineCode>headers</InlineCode> — default headers merged into every request. Per-call
            headers are merged on top.
          </li>
          <li>
            <InlineCode>onError</InlineCode> — global error handler for every{" "}
            <InlineCode>HTTPError</InlineCode>.
          </li>
          <li>
            <InlineCode>onSuccess</InlineCode> — global success handler for every successful
            response.
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="return-type">Return Type</h2>
        <p>
          Direct mode returns <InlineCode>Partial&lt;HttpResponse&lt;R&gt;&gt;</InlineCode>{" "}
          instead of raw data. This gives you access to the status code, headers, and parsed data.
        </p>
      </Prose>

      <CodeBlock code={returnTypeCode} language="typescript" />

      <Callout variant="tip" title="Direct vs Proxy return types">
        <p>
          <InlineCode>createClientRequest</InlineCode> returns just the data (
          <InlineCode>R</InlineCode>) by default. <InlineCode>createDirectRequest</InlineCode>{" "}
          always returns <InlineCode>Partial&lt;HttpResponse&lt;R&gt;&gt;</InlineCode> with{" "}
          <InlineCode>status</InlineCode>, <InlineCode>headers</InlineCode>, and{" "}
          <InlineCode>data</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="usage">Basic Usage</h2>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="api/direct.ts" />

      <Prose>
        <h2 id="context">Passing Context</h2>
        <p>
          The optional third argument is a <InlineCode>Context</InlineCode> object. Use it to
          forward cookies and headers from the incoming request to the backend — essential in RSC
          and Server Actions.
        </p>
      </Prose>

      <CodeBlock code={contextTypeCode} language="typescript" />

      <CodeBlock code={contextCode} filename="app/users/page.tsx" />

      <Prose>
        <h2 id="rsc">React Server Components</h2>
        <p>
          Direct mode is designed for server-only execution. Use it in React Server Components to
          fetch data without a proxy hop.
        </p>
      </Prose>

      <CodeBlock code={rscCode} filename="app/users/page.tsx" />

      <Prose>
        <h2 id="server-actions">Server Actions</h2>
        <p>
          Works seamlessly with Next.js Server Actions for mutations with automatic revalidation.
        </p>
      </Prose>

      <CodeBlock code={actionCode} filename="app/users/actions.ts" />

      <Prose>
        <h2 id="configuring-defaults">Configuring Defaults</h2>
      </Prose>

      <CodeBlock code={defaultsCode} filename="api/direct.ts" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/server-side/overview">Server-Side Overview</Link> — understand direct
            mode architecture
          </li>
          <li>
            <Link href="/docs/server-side/actions">Server Actions</Link> — mutations with
            revalidation
          </li>
          <li>
            <Link href="/docs/api/create-client-request">createClientRequest</Link> — proxy-mode
            alternative for client components
          </li>
          <li>
            <Link href="/docs/api/request">Request</Link> — data source definition class
          </li>
        </ul>
      </Prose>
    </div>
  )
}
