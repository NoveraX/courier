import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const prefetchCode = `// app/users/page.tsx — React Server Component
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query"
import { request } from "@/lib/request"
import { UserList } from "./user-list"

export default async function UsersPage() {
  const queryClient = new QueryClient()

  // Prefetch using the raw \`request\` client in RSC
  await queryClient.prefetchQuery({
    queryKey: ["myApi", "users:getAll"],
    queryFn: () => request("myApi")("users:getAll"),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </HydrationBoundary>
  )
}`

const prefetchClientCode = `// app/users/user-list.tsx
"use client"

import { useQuery } from "@/lib/request"

export function UserList() {
  // This picks up the prefetched data instantly — no loading state
  const { data } = useQuery("myApi", "users:getAll")

  return (
    <ul>
      {data?.data.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}`

const invalidationPatternsCode = `import { useQueryClient } from "@tanstack/react-query"

const queryClient = useQueryClient()

// Invalidate a specific query with exact variables
queryClient.invalidateQueries({
  queryKey: ["myApi", "users:getById", { id: 5 }],
})

// Invalidate all queries for a specific method (any variables)
queryClient.invalidateQueries({
  queryKey: ["myApi", "users:getAll"],
})

// Invalidate every query for a source
queryClient.invalidateQueries({
  queryKey: ["myApi"],
})

// Invalidate everything
queryClient.invalidateQueries()`

const dependentCode = `"use client"

import { useQuery } from "@/lib/request"

export function UserPosts({ userId }: { userId: number }) {
  // First query: fetch the user
  const { data: user } = useQuery("myApi", "users:getById", {
    variables: { id: userId },
  })

  // Second query: only runs after the first succeeds
  const { data: posts, isLoading } = useQuery("myApi", "posts:getByAuthor", {
    variables: { authorId: user?.id! },
    enabled: !!user?.id,
  })

  if (isLoading) return <p>Loading posts...</p>

  return (
    <div>
      <h2>Posts by {user?.name}</h2>
      <ul>
        {posts?.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}`

const parallelCode = `"use client"

import { useQuery } from "@/lib/request"

export function Dashboard() {
  // These queries run in parallel automatically
  const { data: users, isLoading: usersLoading } = useQuery("myApi", "users:getAll")
  const { data: posts, isLoading: postsLoading } = useQuery("myApi", "posts:getAll")
  const { data: stats, isLoading: statsLoading } = useQuery("myApi", "analytics:summary")

  const isLoading = usersLoading || postsLoading || statsLoading
  if (isLoading) return <p>Loading dashboard...</p>

  return (
    <div>
      <h2>Users: {users?.total}</h2>
      <h2>Posts: {posts?.total}</h2>
      <h2>Views: {stats?.totalViews}</h2>
    </div>
  )
}`

const infiniteCode = `"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { request } from "@/lib/request"

type UserList = { data: User[]; total: number; nextPage: number | null }

export function InfiniteUserList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["myApi", "users:getAll"],
    queryFn: ({ pageParam }) =>
      request("myApi")("users:getAll", { page: pageParam, limit: 20 }) as Promise<UserList>,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.data.map((user) => <div key={user.id}>{user.name}</div>)
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading..." : "Load More"}
        </button>
      )}
    </div>
  )
}`

const escapeHatchCode = `// In a utility function (no hooks available)
import { request } from "@/lib/request"

export async function checkAuthStatus(): Promise<boolean> {
  try {
    await request("myApi")("auth:me")
    return true
  } catch {
    return false
  }
}

// In an event handler
const handleExport = async () => {
  const data = await request("myApi")("reports:export", { format: "csv" })
  downloadFile(data)
}

// In a third-party library callback
analytics.onEvent(async (event) => {
  await request("myApi")("analytics:track", { event })
})`

export default async function AdvancedPatternsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Advanced React Query Patterns"
        description="Prefetching, hydration, cache strategies, infinite queries, and escape hatches for complex scenarios."
      />

      <Prose>
        <h2 id="prefetching">Prefetching and hydration</h2>

        <p>
          For the best user experience, prefetch data in Server Components and pass it to the client
          via <InlineCode>HydrationBoundary</InlineCode>. The client component receives cached data
          instantly with no loading state:
        </p>
      </Prose>

      <CodeBlock code={prefetchCode} filename="app/users/page.tsx" />
      <CodeBlock code={prefetchClientCode} filename="app/users/user-list.tsx" />

      <Callout variant="tip" title="Query key must match">
        <p>
          The <InlineCode>queryKey</InlineCode> in <InlineCode>prefetchQuery</InlineCode> must
          exactly match the auto-generated key from <InlineCode>useQuery</InlineCode>. For a query{" "}
          <InlineCode>{`useQuery("myApi", "users:getAll")`}</InlineCode>, the key is{" "}
          <InlineCode>{`["myApi", "users:getAll"]`}</InlineCode>. With variables, include them as
          the third element.
        </p>
      </Callout>

      <Prose>
        <h2 id="cache-invalidation">Cache invalidation patterns</h2>

        <p>
          React Query uses partial key matching for invalidation. You can invalidate at different
          levels of specificity:
        </p>
      </Prose>

      <CodeBlock code={invalidationPatternsCode} />

      <Prose>
        <h2 id="dependent-queries">Dependent queries</h2>

        <p>
          When one query depends on another&apos;s result, use the <InlineCode>enabled</InlineCode>{" "}
          option to create a chain. The second query only fires after the first succeeds:
        </p>
      </Prose>

      <CodeBlock code={dependentCode} filename="components/user-posts.tsx" />

      <Prose>
        <h2 id="parallel-queries">Parallel queries</h2>

        <p>
          Multiple <InlineCode>useQuery</InlineCode> calls in the same component run in parallel
          automatically. React Query manages all the loading and error states independently:
        </p>
      </Prose>

      <CodeBlock code={parallelCode} filename="components/dashboard.tsx" />

      <Prose>
        <h2 id="infinite-queries">Infinite queries</h2>

        <p>
          For paginated lists with a &quot;load more&quot; pattern, use React Query&apos;s{" "}
          <InlineCode>useInfiniteQuery</InlineCode> with the raw <InlineCode>request</InlineCode>{" "}
          client as the query function:
        </p>
      </Prose>

      <CodeBlock code={infiniteCode} filename="components/infinite-user-list.tsx" />

      <Callout variant="info" title="Manual wrapper">
        <p>
          Nexus doesn&apos;t wrap <InlineCode>useInfiniteQuery</InlineCode> directly — use the raw{" "}
          <InlineCode>request</InlineCode> function as the <InlineCode>queryFn</InlineCode>. This
          gives you full control over pagination logic while keeping the same proxy transport.
        </p>
      </Callout>

      <Prose>
        <h2 id="request-escape-hatch">The request escape hatch</h2>

        <p>
          When you need to make API calls outside React components or hooks — in utility functions,
          event handlers, or third-party callbacks — use the <InlineCode>request</InlineCode>{" "}
          function directly:
        </p>
      </Prose>

      <CodeBlock code={escapeHatchCode} filename="lib/utils.ts" />

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/hooks">Hooks (Lifecycle)</Link> — onRequest, onResponse, and
            onError hooks for request interception
          </li>
          <li>
            <Link href="/docs/advanced/singleton">Singleton Pattern</Link> — module augmentation for
            global type-safe access
          </li>
          <li>
            <Link href="/docs/server-side/direct">createDirectRequest</Link> — server-side
            alternative for RSC and Server Actions
          </li>
        </ul>
      </Prose>
    </div>
  )
}
