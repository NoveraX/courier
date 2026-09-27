<div align="center">
  <br />

  # @noverax/courier-react

  **React integration for Courier — hooks, SSE subscriptions, query keys, zero boilerplate.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-react"><img src="https://img.shields.io/npm/v/@noverax/courier-react?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/courier-react"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/courier-react?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

  <br />
</div>

<br />

## Overview

Wraps `@tanstack/react-query` with full Courier type inference. Group names, method names, variables, and response types are inferred automatically — no manual generics.

<br />

## Install

```bash
npm install @noverax/courier-react @noverax/courier @tanstack/react-query
```

<br />

## Setup

Two query callers are available — pick the one that matches your transport mode:

**Proxy mode** (browser → server adapter → backend) — use when the API definition cannot ship to the browser (secrets, CORS, bundle size):

```ts
// lib/query.ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import type { api } from "@/api/sources"

// Imported as a type: the API definition stays on the server. For
// useSubscription / useChannel, pass `boundary` from `defineBoundary`
// to name the streams and channels the browser may reach.
export const q = createProxyQueryCaller<typeof api>("api", {
  proxyPath: { http: "/api/request" },  // optional, defaults to /api/request
  timeout: 10000,                       // optional default timeout
})
```

**Direct mode** (browser → backend, no proxy hop) — use for SPAs, React Native, or when you ship the API definition to the client:

```ts
// lib/query.ts
import { createQueryCaller } from "@noverax/courier-react"
import { api } from "@/shared/api"

export const q = createQueryCaller(api, {
  timeout: 10000,
})
```

<br />

## Hooks

Access hooks through dot-notation: `q.{group}.useQuery(method, options?)`.

### `useQuery`

```tsx
import { q } from "@/lib/query"

function Users() {
  const { data, isLoading, error } = q.users.useQuery("getAll")
  //      ^? User[]
}
```

With variables:

```tsx
const { data } = q.users.useQuery("getById", { variables: { id: "1" } })
//      ^? User
```

With React Query options:

```tsx
const { data } = q.users.useQuery("getAll", {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
})
```

### `useSuspenseQuery`

```tsx
import { q } from "@/lib/query"

function Users() {
  const { data } = q.users.useSuspenseQuery("getAll")
  //      ^? User[] (never undefined)
}
```

### `useMutation`

```tsx
import { q } from "@/lib/query"

function CreateUser() {
  const { mutate, isPending } = q.users.useMutation("create", {
    onSuccess: (user) => console.log(user.name),
    //                               ^? string
  })

  return (
    <button onClick={() => mutate({ name: "Alice", email: "alice@test.com" })} disabled={isPending}>
      Create
    </button>
  )
}
```

### `useInfiniteQuery`

```tsx
import { q } from "@/lib/query"

function Feed({ tag }: { tag: string }) {
  const { data, fetchNextPage } = q.posts.useInfiniteQuery("list", {
    variables: (cursor) => ({ cursor, tag, limit: 20 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}
```

`variables` is a function of the page parameter: it is called for every page, so the parameter reaches the request. The first page's variables are part of the cache key, so a changed `tag` starts a new list from its first page.

### `prefetchQuery`

Server-side prefetching for Next.js or SSR:

```ts
import { q } from "@/lib/query"
import { QueryClient } from "@noverax/courier-react"

const queryClient = new QueryClient()

await q.users.prefetchQuery(queryClient, "getAll")
```

<br />

## Query Keys

Keys are generated hierarchically: `[source, group, method, variables?]`:

```ts
q.users.useQuery("getAll")                             // → ["api", "users", "getAll"]
q.users.useQuery("getById", { variables: { id: "1" }}) // → ["api", "users", "getById", { id: "1" }]
q.posts.useInfiniteQuery("list", {
  variables: (cursor) => ({ cursor, tag: "news" }),
  initialPageParam: 0,
  getNextPageParam: (page) => page.nextCursor,
})                                                     // → ["api", "posts", "list", { cursor: 0, tag: "news" }, "infinite"]

// Invalidate a specific method, infinite lists of it included
queryClient.invalidateQueries({ queryKey: ["api", "users", "getAll"] })

// Invalidate an entire group
queryClient.invalidateQueries({ queryKey: ["api", "users"] })

// Invalidate everything
queryClient.invalidateQueries({ queryKey: ["api"] })
```

<br />

## Re-exports

For convenience, this package re-exports `QueryClient` and `QueryClientProvider` from `@tanstack/react-query`:

```tsx
import { QueryClient, QueryClientProvider } from "@noverax/courier-react"
```

<br />

## License

[MIT](../../LICENSE)
