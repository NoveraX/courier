import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { CodeGroup } from "@/components/docs/code-group"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { StepList } from "@/components/docs/step-list"
import { PageHeader } from "@/components/layout/page-header"

const providerCode = `// app/providers.tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}`

const layoutCode = `// app/layout.tsx
import { Providers } from "./providers"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}`

const setupCode = `// lib/request.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api"

export const api = createQueryRequest<Sources>()

// Destructure for convenience
export const { useQuery, useMutation, request } = api`

const setupWithDefaultsCode = `// lib/request.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api"

export const { useQuery, useMutation, request } = createQueryRequest<Sources>({
  // Custom proxy route path (default: "request")
  requestPage: "api/my-proxy",

  // Request timeout in milliseconds
  timeout: 10000,

  // Include cookies in proxy requests
  credentials: "include",

  // Default headers for all requests
  headers: {
    "X-App-Version": "1.0.0",
  },

  // Global error handler
  onError: async (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login"
    }
  },

  // Global success handler
  onSuccess: (data) => {
    console.log("Request succeeded:", data)
  },
})`

const rawClientCode = `"use client"

import { request } from "@/lib/request"

export function LogoutButton() {
  const handleLogout = async () => {
    // Use the raw client outside of React Query hooks
    await request("myApi")("auth:logout")
    window.location.href = "/login"
  }

  return <button onClick={handleLogout}>Log out</button>
}`

export default async function ReactQuerySetupPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="React Query Setup"
        description="Integrate Nexus with @tanstack/react-query for automatic caching, refetching, and type-safe hooks."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          <InlineCode>createQueryRequest</InlineCode> wraps Nexus&apos;s proxy client with React
          Query hooks. It returns three things: <InlineCode>useQuery</InlineCode> for fetching data,{" "}
          <InlineCode>useMutation</InlineCode> for modifying data, and{" "}
          <InlineCode>request</InlineCode> — the raw <InlineCode>createClientRequest</InlineCode>{" "}
          client for non-hook usage.
        </p>
      </Prose>

      <StepList
        steps={[
          {
            title: "Install @tanstack/react-query",
            content: (
              <div className="mt-4 space-y-4">
                <p>React Query is a peer dependency — install it alongside Nexus:</p>
                <CodeGroup
                  items={[
                    { label: "npm", code: "npm install @tanstack/react-query", language: "bash" },
                    { label: "pnpm", code: "pnpm add @tanstack/react-query", language: "bash" },
                    { label: "yarn", code: "yarn add @tanstack/react-query", language: "bash" },
                    { label: "bun", code: "bun add @tanstack/react-query", language: "bash" },
                  ]}
                />
              </div>
            ),
          },
          {
            title: "Set up QueryClientProvider",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  React Query requires a <InlineCode>QueryClientProvider</InlineCode> at the root of
                  your app. Create a client component that wraps your layout:
                </p>
                <CodeBlock code={providerCode} filename="app/providers.tsx" />
                <CodeBlock code={layoutCode} filename="app/layout.tsx" />
              </div>
            ),
          },
          {
            title: "Create the Nexus query client",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  Call <InlineCode>createQueryRequest</InlineCode> with your{" "}
                  <InlineCode>Sources</InlineCode> type. Export the hooks from a single file so
                  every component imports from the same place:
                </p>
                <CodeBlock code={setupCode} filename="lib/request.ts" />
                <Callout variant="tip" title="Single export file">
                  <p>
                    Keep <InlineCode>useQuery</InlineCode> and <InlineCode>useMutation</InlineCode>{" "}
                    in one file. This ensures all components share the same client instance and
                    defaults.
                  </p>
                </Callout>
              </div>
            ),
          },
        ]}
      />

      <Prose>
        <h2 id="defaults">Configuring defaults</h2>

        <p>
          <InlineCode>createQueryRequest</InlineCode> accepts an optional{" "}
          <InlineCode>ClientRequestDefaults</InlineCode> object to configure the underlying proxy
          client. These defaults apply to every request made through{" "}
          <InlineCode>useQuery</InlineCode>, <InlineCode>useMutation</InlineCode>, and{" "}
          <InlineCode>request</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={setupWithDefaultsCode} filename="lib/request.ts" />

      <Prose>
        <h2 id="request-escape-hatch">The request escape hatch</h2>

        <p>
          The <InlineCode>request</InlineCode> property is the raw{" "}
          <InlineCode>createClientRequest</InlineCode> function. Use it when you need to make a
          request outside of React hooks — in event handlers, utility functions, or anywhere hooks
          aren&apos;t available:
        </p>
      </Prose>

      <CodeBlock code={rawClientCode} filename="components/logout-button.tsx" />

      <Callout variant="info" title="Same client, same defaults">
        <p>
          The <InlineCode>request</InlineCode> function shares the same defaults (timeout, headers,
          onError) as the hooks. It&apos;s the same underlying client — just without React Query
          wrapping.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/react-query/use-query">useQuery</Link> — fetch data with type-safe
            queries
          </li>
          <li>
            <Link href="/docs/react-query/use-mutation">useMutation</Link> — create, update, and
            delete with typed mutations
          </li>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — the underlying
            proxy client API
          </li>
        </ul>
      </Prose>
    </div>
  )
}
