import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const setupCode = `// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api"

export const directRequest = createDirectRequest(sources)`

const rscCode = `// app/dashboard/page.tsx — React Server Component
import { directRequest } from "@/lib/direct-request"

export default async function DashboardPage() {
  const users = await directRequest("myApi")("users:getAll", { page: 1, limit: 10 })

  return (
    <ul>
      {users.data.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}`

const actionCode = `// app/actions/users.ts — Server Action
"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { directRequest } from "@/lib/direct-request"

export async function createUser(data: { name: string; email: string }) {
  const user = await directRequest("myApi")(
    "users:create",
    data,
    { headers: await headers() }
  )

  revalidatePath("/dashboard")
  return user
}`

const contextCode = `// app/profile/page.tsx — forwarding cookies for auth
import { headers } from "next/headers"
import { directRequest } from "@/lib/direct-request"

export default async function ProfilePage() {
  // Pass headers so cookies (auth tokens) reach the backend
  const profile = await directRequest("myApi")(
    "users:me",
    undefined,
    { headers: await headers() }
  )

  return <h1>Welcome, {profile.name}</h1>
}`

export const metadata = docsMetadata("Server-Side Overview", "Fetch data directly from your backend in React Server Components and Server Actions — no proxy hop, no client bundle.")

export default async function ServerSideOverviewPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Server-Side Overview"
        description="Fetch data directly from your backend in React Server Components and Server Actions — no proxy hop, no client bundle."
      />

      <Prose>
        <h2 id="what-is-direct-mode">What is direct mode?</h2>

        <p>
          In <strong>direct mode</strong>, your server-side code calls the backend directly without
          routing through an API proxy. The request flow is straightforward:
        </p>

        <pre>
          <code>createDirectRequest → createRequest → Instance → ky → backend</code>
        </pre>

        <p>
          There is no intermediate HTTP hop, no serialization through an API route, and no exposure
          to the client bundle. Your backend URL, API keys, and other secrets remain on the server.
        </p>
      </Prose>

      <Callout variant="info" title="Same sources, different transport">
        <p>
          Direct mode uses the same <InlineCode>Request</InlineCode> and{" "}
          <InlineCode>RequestGroup</InlineCode> classes as proxy mode. You define your API structure
          once and use it from both client and server code.
        </p>
      </Callout>

      <Prose>
        <h2 id="when-to-use">When to use direct mode</h2>

        <p>Use direct mode whenever your code runs on the server:</p>

        <ul>
          <li>
            <strong>React Server Components (RSC)</strong> — fetch data at render time with zero
            client JavaScript
          </li>
          <li>
            <strong>Server Actions</strong> — handle form submissions and mutations without writing
            API routes
          </li>
          <li>
            <strong>API Routes</strong> — when your Next.js route handler needs to aggregate data
            from your backend
          </li>
          <li>
            <strong>Middleware</strong> — validate tokens or fetch user data before routing
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="benefits">Benefits over proxy mode</h2>

        <ul>
          <li>
            <strong>Lower latency</strong> — eliminates the extra HTTP hop through{" "}
            <InlineCode>/api/request</InlineCode>
          </li>
          <li>
            <strong>Server-only secrets</strong> — backend URLs and API keys never appear in the
            client bundle
          </li>
          <li>
            <strong>No client JavaScript</strong> — RSC data fetching adds zero bytes to the browser
            bundle
          </li>
          <li>
            <strong>Simpler error handling</strong> — errors stay on the server, no need to
            serialize them for the client
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="comparison">Proxy vs Direct mode</h2>
      </Prose>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-semibold">Feature</th>
              <th className="px-4 py-3 font-semibold">Proxy Mode</th>
              <th className="px-4 py-3 font-semibold text-brand">Direct Mode</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Execution</td>
              <td className="px-4 py-3">Browser → API route → backend</td>
              <td className="px-4 py-3">Server → backend</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Latency</td>
              <td className="px-4 py-3">Extra HTTP hop</td>
              <td className="px-4 py-3 text-success">Single hop</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Client bundle</td>
              <td className="px-4 py-3">Includes request code</td>
              <td className="px-4 py-3 text-success">Zero bytes</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">React Query</td>
              <td className="px-4 py-3 text-success">Built-in hooks</td>
              <td className="px-4 py-3">Not needed (async/await)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Cookie forwarding</td>
              <td className="px-4 py-3 text-success">Automatic</td>
              <td className="px-4 py-3">Via Context parameter</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">Use case</td>
              <td className="px-4 py-3">Client components</td>
              <td className="px-4 py-3">RSC, Server Actions, API routes</td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-foreground">Requires API route</td>
              <td className="px-4 py-3">Yes</td>
              <td className="px-4 py-3 text-success">No</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Prose>
        <h2 id="setup">Quick setup</h2>

        <p>
          Create a direct request client by passing your sources to{" "}
          <InlineCode>createDirectRequest</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={setupCode} filename="lib/direct-request.ts" />

      <Prose>
        <h2 id="usage-rsc">Usage in Server Components</h2>

        <p>
          Call the direct request client in any <InlineCode>async</InlineCode> server component. The
          data is fetched at render time on the server:
        </p>
      </Prose>

      <CodeBlock code={rscCode} filename="app/dashboard/page.tsx" />

      <Prose>
        <h2 id="usage-actions">Usage in Server Actions</h2>

        <p>
          Server Actions use the same direct request client. Pass <InlineCode>headers()</InlineCode>{" "}
          as context to forward authentication cookies:
        </p>
      </Prose>

      <CodeBlock code={actionCode} filename="app/actions/users.ts" />

      <Prose>
        <h2 id="context">Context and cookie forwarding</h2>

        <p>
          In direct mode, the browser&apos;s cookies are not automatically available. To forward
          authentication headers, pass a <InlineCode>Context</InlineCode> object with the current{" "}
          <InlineCode>headers()</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={contextCode} filename="app/profile/page.tsx" />

      <Callout variant="tip" title="Header whitelist">
        <p>
          Nexus only forwards safe headers from the context: <InlineCode>authorization</InlineCode>,{" "}
          <InlineCode>cookie</InlineCode>, <InlineCode>user-agent</InlineCode>,{" "}
          <InlineCode>x-forwarded-*</InlineCode>, <InlineCode>x-real-ip</InlineCode>, and others.
          Custom headers from <InlineCode>defaults.headers</InlineCode> are always included.
        </p>
      </Callout>

      <Prose>
        <h2 id="security">Security considerations</h2>

        <p>Direct mode runs exclusively on the server. This means:</p>

        <ul>
          <li>
            Your backend URL (<InlineCode>API_URL</InlineCode>) is never sent to the browser
          </li>
          <li>
            API keys and tokens in <InlineCode>defaults.headers</InlineCode> stay server-side
          </li>
          <li>
            Source code for <InlineCode>createDirectRequest</InlineCode> is tree-shaken from the
            client bundle
          </li>
          <li>Error details (stack traces, internal URLs) never leak to the client</li>
        </ul>
      </Prose>

      <Callout variant="warning" title="Don't import direct-request.ts in client components">
        <p>
          If you import your direct request client in a{" "}
          <InlineCode>&quot;use client&quot;</InlineCode> file, Next.js will try to bundle your
          source definitions (including <InlineCode>process.env.API_URL</InlineCode>) into the
          client. Keep direct request imports in server-only files.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/server-side/direct">createDirectRequest</Link> — full API reference,
            defaults, and advanced usage
          </li>
          <li>
            <Link href="/docs/server-side/actions">Server Actions</Link> — mutations, revalidation,
            and error handling patterns
          </li>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode Overview</Link> — client-side requests
            through the API route
          </li>
        </ul>
      </Prose>
    </div>
  )
}
