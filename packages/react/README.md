<div align="center">
  <br />

  # @noverax/courier-react

  **React integration for Courier — query hooks, streams and channels, query keys, zero boilerplate.**

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
import { boundary } from "@/api/boundary"

// Imported as a type: the API definition stays on the server. `boundary`,
// from `defineBoundary`, names the streams and channels the browser may
// reach and carries their proxy paths; an API that has any requires it.
export const q = createProxyQueryCaller<typeof api>("api", {
  boundary,
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

Hooks are offered per group. An endpoint declared at the top level of `defineApi({ endpoints })` has none — a caller for an API with no groups does not compile, and in one that mixes groups with top-level endpoints only the groups appear — so declare the endpoints a component needs inside a group.

### `useQuery`

```tsx
import { q } from "@/lib/query"

function Users() {
  const { data, isLoading, error } = q.users.useQuery("getAll")
  //      ^? User[]
}
```

Every hook types its error as `Error`, as TanStack Query does: an `HTTPError` for an error answer, but a `ValidationError` for an answer that fails its schema, a `ConfigurationError` for a client set up wrongly, or the reason a call was cancelled with. Narrow it with the guards from `@noverax/courier`:

```tsx
import { isHTTPError } from "@noverax/courier"

function User({ id }: { id: string }) {
  const { data, error } = q.users.useQuery("getById", { variables: { id } })
  if (isHTTPError(error) && error.status === 404) return <NotFound />
  return <p>{data?.name}</p>
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

`select` shapes what the hook returns, and its type follows:

```tsx
const { data: count } = q.users.useQuery("getAll", { select: (users) => users.length })
//      ^? number | undefined
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

An optimistic update can come from `optimisticOptions`: the cache shows the change at once, is put back as it was — an entry the update created is removed — when the mutation fails, and is fetched again once it settles:

```tsx
import { optimisticOptions, useQueryClient } from "@noverax/courier-react"

const queryClient = useQueryClient()
const { mutate } = q.users.useMutation("create", {
  ...optimisticOptions<User[], NewUser>(queryClient, {
    queryKey: ["api", "users", "getAll"],
    updater: (users, user) => [...(users ?? []), { id: -1, ...user }],
  }),
})
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

Server-side prefetching for Next.js or SSR. On the server there is no page for a proxy caller to resolve a relative `proxyPath` against, so prefetch there with a direct caller built from the API definition, which the server has anyway:

```ts
// lib/query.server.ts — imported by server code only
import { createQueryCaller } from "@noverax/courier-react"
import { api } from "@/api/sources"

export const qServer = createQueryCaller(api)
```

```tsx
// app/users/page.tsx — a Server Component
import { dehydrate, HydrationBoundary, QueryClient } from "@noverax/courier-react"
import { qServer } from "@/lib/query.server"

export default async function UsersPage() {
  const queryClient = new QueryClient()
  await qServer.users.prefetchQuery(queryClient, "getAll")

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Users />
    </HydrationBoundary>
  )
}
```

The client's `q.users.useQuery("getAll")` then starts from the prefetched data, provided both callers build the same keys: give the definition the proxy's source name, `defineApi({ name: "api", … })` for `createProxyQueryCaller<typeof api>("api")` (see [Query Keys](#query-keys)). A proxy-mode `useSuspenseQuery` rendered on the server would fetch there as well, and fail for the same reason; prefetch its data like this and it hydrates instead. A proxy caller can run on the server only with an absolute `proxyPath.http`.

No module of the package is marked `"use client"`, so a React Server Component can create a caller, prefetch, build keys and use `QueryClient`, `dehydrate` and `HydrationBoundary` from it. The hooks themselves run in Client Components.

<br />

## Streams & Channels

### `useSubscription`

Follows a stream endpoint for as long as the component is mounted:

```tsx
function Ticker({ symbol }: { symbol: string }) {
  const { data, events, status, error } = q.prices.useSubscription("ticks", {
    variables: { symbol },
  })
  //      ^? Tick | undefined
}
```

- `data` is the latest event's payload, or `optimisticData` until the first one arrives.
- `events` keeps the stream's latest events, oldest first: 100 unless `maxEvents` says otherwise. `maxEvents: Infinity` keeps them all, and the list then grows for as long as the stream runs.
- `status` is `connecting` from the first render until the stream reports otherwise; `disconnected` while `enabled` is `false`, and once the stream could not be opened.
- `error` says why the stream failed or could not be opened; `onData`, `onError` and `onStatusChange` hear the same as it happens.

A change of method or variables opens another stream, and `data`, `events`, `error` and `status` start over with it in the same render.

### `useComputedQuery`

Fetches a query and merges a stream of the same group into its cached data. Events that arrive before the query's first answer are merged into it, in order:

```tsx
const { data: orders } = q.orders.useComputedQuery("list", {
  subscriptionMethod: "changes",
  mapper: (orders, event) => [...(orders ?? []), event.data],
  onStreamError: (error) => console.warn("Live updates stopped:", error.message),
})
```

A stream that fails, is refused or cannot be opened leaves the query as it is — its data, its error — and says why through `onStreamError`; `onStreamStatusChange` follows the stream's status.

### `useChannel`

Joins a channel, with the last message the server sent on it and `send` to answer:

```tsx
function Room({ room }: { room: string }) {
  const { lastMessage, status, send } = q.chat.useChannel("room", { variables: { room } })

  return <button onClick={() => send({ text: "hello" })}>Say hello</button>
}
```

`send` answers whether the message went out or waits to — before the channel has opened, or while the connection comes back — and `false`, with a warning, for one it dropped: the channel disabled, closed or ended by the server, the queue full, or a message larger than the socket accepts. It returns a value, so inside an effect call it in a block: `useEffect(() => { send(message) }, [send, message])`.

A proxy caller opens channels at `proxyPath.ws`, which has no default.

### `useConnectionStatus`

The hooks above report their own `status`. For a stream or channel opened with a plain caller, `useConnectionStatus(source)` returns `{ status, isConnected, isReconnecting }`; `null` reads as `disconnected`.

<br />

## Query Keys

Keys are generated hierarchically: `[source, group, method, variables?]`. `source` is the name the caller was made for: the first argument of `createProxyQueryCaller`, and for `createQueryCaller(api)` the API's own name — its `defineApi({ name })`, or else the first label of its `baseURL` host (`https://api.example.com` → `"api"`, `http://127.0.0.1:4000` → `"127"`). Name the API explicitly when a direct and a proxy caller must share a cache.

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

For convenience, this package re-exports `QueryClient`, `QueryClientProvider`, `useQueryClient`, `dehydrate` and `HydrationBoundary` from `@tanstack/react-query`:

```tsx
import { QueryClient, QueryClientProvider } from "@noverax/courier-react"
```

<br />

## License

[MIT](../../LICENSE)
