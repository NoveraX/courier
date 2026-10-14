<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for React</h1>

  <p><strong>React Query hooks, typed from your API definition.</strong></p>

  <p>Every group of your API becomes hooks — <code>useQuery</code>, <code>useMutation</code>, <code>useSuspenseQuery</code>, <code>useInfiniteQuery</code> — and every stream and channel a live one. Names, variables and answers inferred: no generics, no query keys by hand.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-react"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-react?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a&color=1c63d6" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/react-query/setup"><strong>React Query guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/react">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/react-dark.png" />
    <img alt="An editor completing q.users.useQuery with the group's two reads, getAll and getById, each with its variables and answer typed from the API's definition" src="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/react-light.png" width="880" />
  </picture>
  <br />
</div>

<br />

## Overview

Wraps `@tanstack/react-query` with Courier's type inference. Group names, method names, variables and response types come from the API definition, so a hook knows what it returns before you run it — and an endpoint renamed in the definition is a compile error at every hook that named it.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Typed to the answer</h4>
      <code>q.users.useQuery("getAll")</code> is a <code>User[]</code>; <code>select</code> reshapes it, and the type follows.
    </td>
    <td width="33%" valign="top">
      <h4>Keys you never write</h4>
      Hierarchical keys — source, group, method, variables — so one line invalidates an endpoint, a group or the whole API.
    </td>
    <td width="33%" valign="top">
      <h4>Optimistic updates</h4>
      <code>optimisticOptions</code> shows a change at once and puts the cache back when the mutation fails.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Live data</h4>
      <code>useSubscription</code> follows a stream, <code>useChannel</code> joins a WebSocket channel, <code>useComputedQuery</code> merges a stream into a query.
    </td>
    <td valign="top">
      <h4>Server Components</h4>
      Prefetch on the server with the same keys and hydrate on the client; no module is marked <code>"use client"</code>.
    </td>
    <td valign="top">
      <h4>Proxy or direct</h4>
      A proxy caller keeps the definition on the server; a direct one serves single-page apps and React Native.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-react @noverax/courier @tanstack/react-query
```

`@tanstack/react-query` 5.80 or later.

<br />

## Setup

Two query callers are available — pick the one that matches your transport mode:

**Proxy mode** (browser → server adapter → backend) — use when the API definition cannot ship to the browser (secrets, CORS, bundle size):

```ts
// lib/query.ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import { apiRoutes } from "@/courier.routes"

// The routes Courier writes from the endpoints you mark .expose():
// what a page may call, and how — streams and channels included. The API
// definition stays on the server.
export const q = createProxyQueryCaller(apiRoutes, {
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

The client's `q.users.useQuery("getAll")` then starts from the prefetched data, provided both callers build the same keys: give the definition the proxy's source name, `defineApi({ name: "api", … })` for the routes of the source registered as `api` (see [Query Keys](#query-keys)). A proxy-mode `useSuspenseQuery` rendered on the server would fetch there as well, and fail for the same reason; prefetch its data like this and it hydrates instead. A proxy caller can run on the server only with an absolute `proxyPath.http`.

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

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/next"><strong>@noverax/courier-next</strong></a><br />
      One route, Server Actions and the session in Next.js.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
    </td>
  </tr>
</table>

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
