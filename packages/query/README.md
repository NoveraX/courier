<div align="center">
  <br />

  # @noverax/nexus-query

  **React Query integration for Nexus — fully typed hooks, zero boilerplate.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-query"><img src="https://img.shields.io/npm/v/@noverax/nexus-query?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/nexus-query"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/nexus-query?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

  <br />
</div>

<br />

## Overview

Wraps `@tanstack/react-query` with full Nexus type inference. Endpoint names, variables, and response types are inferred automatically — no manual generics.

<br />

## Install

```bash
npm install @noverax/nexus-query @noverax/nexus @tanstack/react-query
```

<br />

## Setup

```ts
// lib/caller.ts
import { createQueryCaller } from "@noverax/nexus-query"
import type { Sources } from "@/api/sources"

export const {
  useQuery,
  useMutation,
  useSuspenseQuery,
  useInfiniteQuery,
  prefetchQuery,
  caller,
} = createQueryCaller<Sources>({
  proxyUrl: "/api/request",  // optional, defaults to "/api/request"
  timeout: 10000,            // optional default timeout
})
```

<br />

## Hooks

### `useQuery`

```tsx
import { useQuery } from "@/lib/caller"

function Users() {
  const { data, isLoading, error } = useQuery("api", "users:getAll")
  //      ^? User[]
}
```

With variables:

```tsx
const { data } = useQuery("api", "users:getById", { variables: { id: "1" } })
//      ^? User
```

With React Query options:

```tsx
const { data } = useQuery("api", "users:getAll", {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
})
```

### `useSuspenseQuery`

```tsx
import { useSuspenseQuery } from "@/lib/caller"

function Users() {
  const { data } = useSuspenseQuery("api", "users:getAll")
  //      ^? User[] (never undefined)
}
```

### `useMutation`

```tsx
import { useMutation } from "@/lib/caller"

function CreateUser() {
  const { mutate, isPending } = useMutation("api", "users:create", {
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
import { useInfiniteQuery } from "@/lib/caller"

function Feed() {
  const { data, fetchNextPage } = useInfiniteQuery("api", "posts:list", {
    variables: { limit: 20 },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}
```

### `prefetchQuery`

Server-side prefetching for Next.js or SSR:

```ts
import { prefetchQuery } from "@/lib/caller"
import { QueryClient } from "@noverax/nexus-query"

const queryClient = new QueryClient()

await prefetchQuery(queryClient, "api", "users:getAll")
```

<br />

## Optimistic Updates

```ts
import { optimisticOptions } from "@noverax/nexus-query"

const { mutate } = useMutation("api", "users:create", {
  ...optimisticOptions(queryClient, {
    queryKey: ["api", "users:getAll"],
    updater: (current, newUser) => [...current, newUser],
  }),
})
```

<br />

## Re-exports

For convenience, this package re-exports `QueryClient` and `QueryClientProvider` from `@tanstack/react-query`:

```tsx
import { QueryClient, QueryClientProvider } from "@noverax/nexus-query"
```

<br />

## License

[MIT](../../LICENSE)
