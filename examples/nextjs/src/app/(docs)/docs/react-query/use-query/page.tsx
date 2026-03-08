import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `const result = useQuery(source, query, options?)

// source  — key from your Sources type (e.g. "myApi")
// query   — "group:method" string (e.g. "users:getAll")
// options — { variables?, requestOptions?, ...reactQueryOptions }`

const basicCode = `"use client"

import { useQuery } from "@/lib/request"

export function UserList() {
  const { data, isLoading, error } = useQuery("myApi", "users:getAll")
  //      ^? UserList — auto-inferred from Method<UserList>

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <ul>
      {data?.data.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}`

const variablesCode = `"use client"

import { useQuery } from "@/lib/request"

export function UserProfile({ userId }: { userId: number }) {
  // Method<User, { id: number }> → variables is required
  const { data: user, isLoading } = useQuery("myApi", "users:getById", {
    variables: { id: userId },
    //          ^? { id: number } — auto-inferred from Method
  })

  if (isLoading) return <p>Loading...</p>

  return (
    <div>
      <h1>{user?.name}</h1>
      <p>{user?.email}</p>
    </div>
  )
}`

const conditionalCode = `"use client"

import { useQuery } from "@/lib/request"

export function UserProfile({ userId }: { userId: number | null }) {
  const { data, isLoading } = useQuery("myApi", "users:getById", {
    variables: { id: userId! },
    // Only fetch when userId is available
    enabled: userId !== null,
  })

  if (!userId) return <p>Select a user</p>
  if (isLoading) return <p>Loading...</p>

  return <h1>{data?.name}</h1>
}`

const reactQueryOptionsCode = `const { data } = useQuery("myApi", "users:getAll", {
  variables: { page: 1, limit: 20 },

  // Standard React Query options — all supported
  staleTime: 5 * 60 * 1000,       // Consider data fresh for 5 minutes
  refetchInterval: 30 * 1000,     // Refetch every 30 seconds
  refetchOnWindowFocus: false,     // Don't refetch on tab focus
  placeholderData: previousData,   // Keep previous data while refetching
  select: (data) => data.data,     // Transform response before caching

  // Nexus-specific options
  requestOptions: {
    rawData: true,   // Get { data, status, headers } instead of just data
    stream: true,    // Handle streaming responses
  },
})`

const queryKeyCode = `// Auto-generated query key: ["myApi", "users:getAll"]
useQuery("myApi", "users:getAll")

// With variables: ["myApi", "users:getById", { id: 5 }]
useQuery("myApi", "users:getById", { variables: { id: 5 } })

// Use the same key format for cache invalidation
queryClient.invalidateQueries({ queryKey: ["myApi", "users:getAll"] })`

const errorHandlingCode = `"use client"

import { isHTTPError } from "@noverax/nexus"
import { useQuery } from "@/lib/request"

export function UserList() {
  const { data, error, isError } = useQuery("myApi", "users:getAll")

  if (isError) {
    // Check if it's an HTTP error with status/response
    if (isHTTPError(error)) {
      if (error.response.status === 404) return <p>Not found</p>
      if (error.response.status === 403) return <p>Access denied</p>
    }
    return <p>Something went wrong: {error.message}</p>
  }

  return <ul>{data?.data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
}`

export const metadata = docsMetadata(
  "useQuery",
  "Fetch data with automatic caching, refetching, and full type inference from your API definitions."
)

export default async function UseQueryPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="useQuery"
        description="Fetch data with automatic caching, refetching, and full type inference from your API definitions."
      />

      <Prose>
        <h2 id="signature">Signature</h2>

        <p>
          <InlineCode>useQuery</InlineCode> takes a source name, a{" "}
          <InlineCode>{'"group:method"'}</InlineCode> query string, and an optional options object.
          Types are fully inferred from your <InlineCode>Method</InlineCode> definitions:
        </p>
      </Prose>

      <CodeBlock code={signatureCode} />

      <Prose>
        <h2 id="basic-query">Basic query</h2>

        <p>
          The simplest usage — fetch data on mount. The <InlineCode>data</InlineCode> type is
          automatically inferred from the method&apos;s response type:
        </p>
      </Prose>

      <CodeBlock code={basicCode} filename="components/user-list.tsx" />

      <Prose>
        <h2 id="variables">Query with variables</h2>

        <p>
          When a method defines variables (e.g.{" "}
          <InlineCode>{"Method<User, { id: number }>"}</InlineCode>), the{" "}
          <InlineCode>variables</InlineCode> option becomes required. TypeScript will error if you
          omit it:
        </p>
      </Prose>

      <CodeBlock code={variablesCode} filename="components/user-profile.tsx" />

      <Callout variant="info" title="Variables type safety">
        <p>
          If a method declares <InlineCode>{"Method<R>"}</InlineCode> without a second type
          parameter (or <InlineCode>{"Method<R, undefined>"}</InlineCode>), the{" "}
          <InlineCode>variables</InlineCode> option is optional. If the method declares{" "}
          <InlineCode>{"Method<R, V>"}</InlineCode> with a concrete V type, the options object with{" "}
          <InlineCode>variables</InlineCode> is required.
        </p>
      </Callout>

      <Prose>
        <h2 id="conditional">Conditional queries</h2>

        <p>
          Use the <InlineCode>enabled</InlineCode> option to conditionally execute a query. The
          query won&apos;t fire until the condition is true:
        </p>
      </Prose>

      <CodeBlock code={conditionalCode} filename="components/user-profile.tsx" />

      <Prose>
        <h2 id="react-query-options">React Query options</h2>

        <p>
          All standard React Query options are supported alongside Nexus-specific options. Configure
          caching, refetching, and data transformation:
        </p>
      </Prose>

      <CodeBlock code={reactQueryOptionsCode} />

      <Prose>
        <h2 id="query-keys">Auto-generated query keys</h2>

        <p>
          Nexus automatically generates query keys from the source, query, and variables. This means
          cache invalidation works without manually managing keys:
        </p>
      </Prose>

      <CodeBlock code={queryKeyCode} />

      <Callout variant="tip" title="Partial key matching">
        <p>
          React Query supports partial key matching. Invalidating{" "}
          <InlineCode>{`["myApi", "users:getAll"]`}</InlineCode> will match all queries for that
          endpoint regardless of variables. Invalidating <InlineCode>{`["myApi"]`}</InlineCode> will
          match all queries for that source.
        </p>
      </Callout>

      <Prose>
        <h2 id="error-handling">Error handling</h2>

        <p>
          The <InlineCode>error</InlineCode> property is typed as <InlineCode>Error</InlineCode>.
          Use <InlineCode>isHTTPError</InlineCode> to check if it&apos;s an HTTP error with status
          and response details:
        </p>
      </Prose>

      <CodeBlock code={errorHandlingCode} filename="components/user-list.tsx" />

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/react-query/use-mutation">useMutation</Link> — create, update, and
            delete data with typed mutations
          </li>
          <li>
            <Link href="/docs/react-query/advanced">Advanced Patterns</Link> — prefetching,
            hydration, optimistic updates, and cache strategies
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — deep dive into
            HTTPError and error recovery
          </li>
        </ul>
      </Prose>
    </div>
  )
}
