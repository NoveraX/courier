import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { createDirectRequest } from "@noverax/nexus/direct"

// Full signature
function createDirectRequest<T extends Sources>(
  sources: T,
  defaults?: DirectRequestDefaults
): RequestFn<T, true>`

const defaultsCode = `type DirectRequestDefaults = {
  // Request timeout in milliseconds
  timeout?: number
  // Headers sent with every request
  headers?: Record<string, string>
  // Called when any request fails
  onError?: (error: HTTPError) => void | Promise<void>
  // Called when any request succeeds
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const setupCode = `// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api"

export const directRequest = createDirectRequest(sources, {
  timeout: 10000,
  headers: {
    "X-Service": "my-nextjs-app",
  },
  onError: (error) => {
    console.error(\`[API] \${error.response.status}: \${error.message}\`)
  },
})`

const basicUsageCode = `// app/users/page.tsx — React Server Component
import { directRequest } from "@/lib/direct-request"

export default async function UsersPage() {
  // Step 1: select the source → returns a curried function
  const request = directRequest("myApi")

  // Step 2: call with query and variables
  const users = await request("users:getAll", { page: 1, limit: 20 })
  //    ^? UserList — fully typed from your Endpoint definition

  // Or chain it in one expression
  const user = await directRequest("myApi")("users:getById", { id: 5 })
  //    ^? User

  return (
    <div>
      <h1>Users ({users.total})</h1>
      <ul>
        {users.data.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </div>
  )
}`

const contextCode = `import type { Context } from "@noverax/nexus/direct"

type Context = {
  req?: NextRequest      // Next.js request object
  res?: NextResponse     // Next.js response object
  headers?: Headers      // Headers to forward (cookies, auth)
}`

const contextRscCode = `// app/profile/page.tsx — RSC with authentication
import { headers } from "next/headers"
import { directRequest } from "@/lib/direct-request"

export default async function ProfilePage() {
  // headers() returns the incoming request headers (including cookies)
  const profile = await directRequest("myApi")(
    "users:me",
    undefined,        // no variables needed
    { headers: await headers() }  // forward auth cookies to backend
  )

  return <h1>Welcome, {profile.name}</h1>
}`

const contextApiRouteCode = `// app/api/dashboard/route.ts — API route with context
import { type NextRequest, NextResponse } from "next/server"
import { directRequest } from "@/lib/direct-request"

export async function GET(req: NextRequest) {
  // Pass the NextRequest directly — headers are extracted automatically
  const stats = await directRequest("myApi")(
    "dashboard:getStats",
    undefined,
    { req }
  )

  return NextResponse.json(stats)
}`

const rawDataCode = `// Access status code and response headers
const result = await directRequest("myApi", { rawData: true })(
  "users:getById",
  { id: 5 }
)

console.log(result.status)   // 200
console.log(result.headers)  // Headers object
console.log(result.data)     // User — still fully typed`

const callSignaturesCode = `// No variables, no context
await directRequest("myApi")("users:getAll")

// With variables, no context
await directRequest("myApi")("users:getById", { id: 5 })

// No variables, with context
await directRequest("myApi")("users:me", undefined, { headers: await headers() })

// With variables and context
await directRequest("myApi")("users:create", { name: "Jane" }, { headers: await headers() })`

const vsClientCode = `// Proxy mode (client components) — no context parameter
const request = createClientRequest<Sources>()
await request("myApi")("users:getAll", { page: 1 })
//                                      ^ variables only

// Direct mode (server components) — context as last argument
const request = createDirectRequest(sources)
await request("myApi")("users:getAll", { page: 1 }, { headers: await headers() })
//                                      ^ variables    ^ context (optional)`

export const metadata = docsMetadata(
  "createDirectRequest",
  "Factory function for server-side requests — call your backend directly from RSC, Server Actions, and API routes."
)

export default async function CreateDirectRequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="createDirectRequest"
        description="Factory function for server-side requests — call your backend directly from RSC, Server Actions, and API routes."
      />

      <Prose>
        <h2 id="api">API signature</h2>

        <p>
          <InlineCode>createDirectRequest</InlineCode> accepts your sources object and optional
          defaults. It returns a curried function that selects a source, then executes a query:
        </p>
      </Prose>

      <CodeBlock code={signatureCode} filename="@noverax/nexus/direct" />

      <Prose>
        <h2 id="defaults">DirectRequestDefaults</h2>

        <p>
          The optional second argument configures defaults applied to every request made through
          this client:
        </p>
      </Prose>

      <CodeBlock code={defaultsCode} />

      <Prose>
        <p>
          These defaults are merged with per-request options. Per-request headers are merged (not
          replaced), while <InlineCode>timeout</InlineCode> is overridden if specified per-request.
        </p>
      </Prose>

      <CodeBlock code={setupCode} filename="lib/direct-request.ts" />

      <Callout variant="tip" title="Global error logging">
        <p>
          The <InlineCode>onError</InlineCode> callback is useful for centralized error logging. It
          fires before the error propagates to your component, so you can log to Sentry or a custom
          service without repeating try/catch blocks.
        </p>
      </Callout>

      <Prose>
        <h2 id="basic-usage">Basic usage</h2>

        <p>
          The returned function is curried: first select a source, then call a query with optional
          variables and context:
        </p>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="app/users/page.tsx" />

      <Prose>
        <h2 id="call-signatures">Call signatures</h2>

        <p>
          The query function accepts different argument combinations depending on whether your
          method requires variables and whether you need to pass context:
        </p>
      </Prose>

      <CodeBlock code={callSignaturesCode} />

      <Prose>
        <h2 id="context">Context parameter</h2>

        <p>
          The <InlineCode>Context</InlineCode> parameter is what makes direct mode different from
          proxy mode. In proxy mode, cookies are forwarded automatically through the API route. In
          direct mode, you must pass them explicitly:
        </p>
      </Prose>

      <CodeBlock code={contextCode} />

      <Prose>
        <h3 id="context-rsc">In React Server Components</h3>

        <p>
          Use Next.js <InlineCode>headers()</InlineCode> from <InlineCode>next/headers</InlineCode>{" "}
          to get the incoming request headers. This includes cookies, authorization headers, and
          other browser-sent headers:
        </p>
      </Prose>

      <CodeBlock code={contextRscCode} filename="app/profile/page.tsx" />

      <Prose>
        <h3 id="context-api-route">In API routes</h3>

        <p>
          In route handlers, pass the <InlineCode>NextRequest</InlineCode> object directly. Nexus
          extracts the headers from it:
        </p>
      </Prose>

      <CodeBlock code={contextApiRouteCode} filename="app/api/dashboard/route.ts" />

      <Callout variant="info" title="Header whitelist">
        <p>
          When you pass context headers, Nexus only forwards a safe subset:{" "}
          <InlineCode>authorization</InlineCode>, <InlineCode>cookie</InlineCode>,{" "}
          <InlineCode>user-agent</InlineCode>, <InlineCode>x-forwarded-for</InlineCode>,{" "}
          <InlineCode>x-forwarded-host</InlineCode>, <InlineCode>x-forwarded-proto</InlineCode>,{" "}
          <InlineCode>x-real-ip</InlineCode>, and a few others. This prevents accidentally
          forwarding headers like <InlineCode>host</InlineCode> or{" "}
          <InlineCode>content-length</InlineCode> that would break the backend request.
        </p>
      </Callout>

      <Prose>
        <h2 id="raw-data">Raw data mode</h2>

        <p>
          By default, the request returns the parsed JSON body. If you need access to the HTTP
          status code and response headers, pass <InlineCode>rawData: true</InlineCode> as an
          option:
        </p>
      </Prose>

      <CodeBlock code={rawDataCode} />

      <Prose>
        <h2 id="vs-client-request">Difference from createClientRequest</h2>

        <p>
          The key difference is the <InlineCode>Context</InlineCode> parameter. In proxy mode,
          cookies are forwarded automatically through the browser request. In direct mode, you pass
          them explicitly:
        </p>
      </Prose>

      <CodeBlock code={vsClientCode} />

      <Prose>
        <p>
          Internally, <InlineCode>createDirectRequest</InlineCode> sets the{" "}
          <InlineCode>D</InlineCode> (direct) flag to <InlineCode>true</InlineCode>, which changes
          the type signature to accept the context argument. Both functions call the same{" "}
          <InlineCode>createRequest</InlineCode> core under the hood.
        </p>
      </Prose>

      <Callout variant="warning" title="Server-only import">
        <p>
          Never import <InlineCode>createDirectRequest</InlineCode> or your direct request client in{" "}
          <InlineCode>&quot;use client&quot;</InlineCode> files. The sources object contains your{" "}
          <InlineCode>process.env.API_URL</InlineCode>, which would be exposed in the client bundle.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/server-side/actions">Server Actions</Link> — mutations, revalidation,
            and error handling with direct mode
          </li>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — the proxy mode
            equivalent for client components
          </li>
          <li>
            <Link href="/docs/react-query/use-query">React Query useQuery</Link> — use with proxy
            mode for client-side data fetching
          </li>
        </ul>
      </Prose>
    </div>
  )
}
