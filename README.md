<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logos/courier-mark-light.svg" />
    <source media="(prefers-color-scheme: light)" srcset="docs/public/logos/courier-mark-dark.svg" />
    <img alt="Courier" src="docs/public/logos/courier-mark-dark.svg" height="52" />
  </picture>

  <h1>Courier</h1>

  <p><strong>One API definition. Typed calls from every side of your app.</strong></p>

  <p>
    Call any REST backend with end-to-end types — from server code, through a proxy that keeps<br />
    your keys on the server, and over SSE and WebSockets. A mock server and a dev Studio come with it.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/NoveraX/courier/ci.yml?branch=master&style=flat-square&label=ci&labelColor=08090a" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="#quick-start">Quick start</a>
    &nbsp;·&nbsp;
    <a href="examples/basic">Example</a>
    &nbsp;·&nbsp;
    <a href="#courier-studio">Studio</a>
    &nbsp;·&nbsp;
    <a href="#packages">Packages</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/hero-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/hero-light.png" />
    <img alt="An editor completing caller.users. with every endpoint the API defines, each typed from the definition" src=".github/assets/hero-light.png" width="880" />
  </picture>
</div>

<br />

## Why Courier

Most HTTP clients stop at “send a request, get a response”. You still write the same boilerplate for every endpoint, copy types between client and server, and wire validation, retries and errors together yourself.

Courier starts from the other end. You **define your API once**, as plain TypeScript, and every call made from it is typed: endpoint names, variables and answers. It works with **any backend that speaks HTTP** — FastAPI, Rails, Go, Laravel, a service you do not own — and asks nothing of it.

<br />

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>End-to-end types</h4>
      Endpoint names, variables and answers are inferred from one definition. No codegen, no schema files.
    </td>
    <td width="33%" valign="top">
      <h4>Direct and proxy</h4>
      Server code calls your backend itself. The browser goes through your server, which keeps keys, paths and cookies there.
    </td>
    <td width="33%" valign="top">
      <h4>Realtime</h4>
      SSE streams and WebSocket channels, typed both ways, that complete, fail or reconnect as the server says.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Runtime validation</h4>
      Zod, Valibot, ArkType or any Standard Schema — on the variables you send and the answers you get.
    </td>
    <td valign="top">
      <h4>Middleware</h4>
      Retry, auth with token refresh, caching and logging, composed in order — or a middleware of your own.
    </td>
    <td valign="top">
      <h4>React Query</h4>
      <code>useQuery</code>, <code>useMutation</code>, <code>useSuspenseQuery</code>, <code>useInfiniteQuery</code> and <code>useSubscription</code>, typed, with no setup.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Server Actions</h4>
      <code>createAction</code> calls your API from a Next.js Server Action, typed and ready for <code>useActionState</code>.
    </td>
    <td valign="top">
      <h4>Studio and mocks</h4>
      Every call, live; a playground; OpenAPI import; mock servers that keep their records in SQLite.
    </td>
    <td valign="top">
      <h4>Testing</h4>
      An in-memory client with a mock builder and request history, plus contract tests and fixtures.
    </td>
  </tr>
</table>

<br />

## Quick start

```bash
npm install @noverax/courier
```

**1 — Define the API.** Shared by every framework: define once, use everywhere.

```ts
// api/boundary.ts — the endpoints the browser may call through your server
import { defineBoundary } from "@noverax/courier/define"

export const boundary = defineBoundary({
  source: "api",
  expose: { "users.getAll": "query", "users.getById": "query", "users.create": "mutation" },
})
```

```ts
// api/sources.ts
import { courier, defineApi, defineGroup } from "@noverax/courier/define"
import { boundary } from "./boundary"

const { endpoint } = courier()

export type User = { id: string; name: string; email: string }

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string }>().response<User>(),
    update: endpoint.put(":id").variables<{ id: string; name: string }>().response<User>(),
    remove: endpoint.del(":id").variables<{ id: string }>().response<null>(),
  },
})

export const api = defineApi({
  baseURL: process.env.API_URL!,
  boundary,
  groups: { users },
})

// The sources your server's proxy runs, under the names browser callers use
export const sources = { api }
```

**2 — Call it from the server.** Any runtime with `fetch`: Node.js, Bun, Deno, Cloudflare Workers.

```ts
import { createCaller } from "@noverax/courier"
import { api } from "./api/sources"

const caller = createCaller(api)

// Works in Node.js, Bun, Deno, Cloudflare Workers — anywhere with fetch
const users = await caller.users.getAll()
const user = await caller.users.getById({ id: "1" })
```

**3 — Call it from the browser,** through one route on your server.

Server code imports `api` and calls every endpoint. Browser code imports the API only as a type and passes `boundary` instead, so your backend's address, its paths and your middleware never ship with the page — and the proxy refuses every endpoint the boundary does not name. The [framework guides](#frameworks) below show the route and the caller for each framework.

A runnable version — a backend, the proxy in front of it, a page's caller and server code — is in [`examples/basic`](examples/basic): `npm run demo --workspace examples/basic` from the repository root.

<br />

## How it fits together

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/architecture-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/architecture-light.png" />
  <img alt="Server code, the browser and realtime clients call through Courier — types, validation, middleware, the proxy route and streams — to any REST backend; Studio and the mock servers work from the same definition" src=".github/assets/architecture-light.png" />
</picture>

**Direct mode** — code that holds the API definition, usually on your server, calls your backend itself: no extra hop, full type safety.

**Proxy mode** — the browser sends requests through your server, which hides API keys, bypasses CORS, and carries the session cookies a source or an endpoint names: `allowedHeaders: ["cookie", "set-cookie"]` on a backend of your own, or `.headers(["set-cookie"])` on just its sign-in.

Both modes share the same API definition, the same middleware chain, and the same type inference.

<br />

## Frameworks

<table>
  <tr>
    <td align="center" width="96"><a href="#nextjs"><img src="https://api.iconify.design/logos/nextjs-icon.svg" height="28" alt="" /><br /><sub>Next.js</sub></a></td>
    <td align="center" width="96"><a href="#nuxt"><img src="https://api.iconify.design/logos/nuxt-icon.svg" height="28" alt="" /><br /><sub>Nuxt</sub></a></td>
    <td align="center" width="96"><a href="#react"><img src="https://api.iconify.design/logos/react.svg" height="28" alt="" /><br /><sub>React</sub></a></td>
    <td align="center" width="96"><a href="#vue"><img src="https://api.iconify.design/logos/vue.svg" height="28" alt="" /><br /><sub>Vue</sub></a></td>
    <td align="center" width="96"><a href="#svelte"><img src="https://api.iconify.design/logos/svelte-icon.svg" height="28" alt="" /><br /><sub>Svelte</sub></a></td>
    <td align="center" width="96"><a href="#server-adapters"><img src="https://api.iconify.design/logos/hono.svg" height="28" alt="" /><br /><sub>Hono</sub></a></td>
    <td align="center" width="96"><a href="#server-adapters"><img src="https://api.iconify.design/logos/express.svg" height="28" alt="" /><br /><sub>Express</sub></a></td>
    <td align="center" width="96"><a href="#server-adapters"><img src="https://api.iconify.design/logos/fastify-icon.svg" height="28" alt="" /><br /><sub>Fastify</sub></a></td>
    <td align="center" width="96"><a href="#server-adapters"><img src="https://api.iconify.design/logos/nestjs.svg" height="28" alt="" /><br /><sub>NestJS</sub></a></td>
  </tr>
</table>

Astro, Remix and React Router, SolidStart and SvelteKit have adapters too — see [Packages](#packages).

<br />

<a id="nextjs"></a>
<details>
<summary><img src="https://api.iconify.design/logos/nextjs-icon.svg" height="16" align="center" />&nbsp;&nbsp;<strong>Next.js</strong> — proxy route, React Query hooks, Server Components and Server Actions</summary>

<br />

**1. Proxy route** — single route handles all endpoints:

```ts
// instrumentation.ts — registers your sources once, at startup
import { registerSources } from "@noverax/courier"

export async function register() {
  const { sources } = await import("./api/sources")
  registerSources(sources)
}

// app/api/request/route.ts
import { apiRoute } from "@noverax/courier-next"

export const { GET, POST } = apiRoute()
```

With [Courier Studio](https://courier.noverax.cloud/docs/frameworks/nextjs#studio-app-origin), the same `register()` also attaches the Studio runtime in development.

**2. Client caller** — React Query hooks with full type inference:

```ts
// lib/query.ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import type { api } from "@/api/sources"
import { boundary } from "@/api/boundary"

export const q = createProxyQueryCaller<typeof api>("api", { boundary })
```

**3. Client Components:**

```tsx
"use client"
import { q } from "@/lib/query"

export default function UsersPage() {
  const { data: users, isLoading } = q.users.useQuery("getAll")
  //      ^? User[]

  const { mutate } = q.users.useMutation("create", {
    onSuccess: (user) => console.log("Created:", user.name),
    //                                           ^? string
  })

  if (isLoading) return <p>Loading...</p>

  return (
    <ul>
      {users?.map((u) => <li key={u.id}>{u.name}</li>)}
      <button onClick={() => mutate({ name: "Jane", email: "jane@test.com" })}>
        Add User
      </button>
    </ul>
  )
}
```

**4. Server Components** — direct backend calls, no proxy hop:

```tsx
// app/users/page.tsx
import { createCaller } from "@noverax/courier"
import { api } from "@/api/sources"

const caller = createCaller(api)

export default async function UsersPage() {
  const users = await caller.users.getAll()
  //    ^? User[]

  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
}
```

**5. Server Actions** — type-safe form handling with revalidation:

```ts
// app/users/actions.ts
"use server"
import { revalidatePath } from "next/cache"
import { isHTTPError, isValidationError } from "@noverax/courier"
import { type ActionState, createAction } from "@noverax/courier-next"
import { sources } from "@/api/sources"

type User = { id: string; name: string }

const action = createAction(sources, "api")

export async function createUser(_: ActionState<User>, form: FormData): Promise<ActionState<User>> {
  try {
    const user = await action.users.create({
      name: String(form.get("name")),
      email: String(form.get("email")),
    })
    revalidatePath("/users")
    return { data: user, error: null }
  } catch (error) {
    if (isValidationError(error)) return { data: null, error: { message: error.message, issues: error.issues } }
    if (isHTTPError(error)) return { data: null, error: { message: error.message, status: error.status } }
    throw error
  }
}
```

```tsx
"use client"
import { useActionState } from "react"
import { createUser } from "./actions"

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, { data: null, error: null })

  return (
    <form action={formAction}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button disabled={pending}>Create</button>
      {state.error && <p>{state.error.message}</p>}
    </form>
  )
}
```

</details>

<a id="nuxt"></a>
<details>
<summary><img src="https://api.iconify.design/logos/nuxt-icon.svg" height="16" align="center" />&nbsp;&nbsp;<strong>Nuxt</strong> — Nitro route, a composable, server-side calls</summary>

<br />

**1. Server route** — Nitro/h3 event handler:

```ts
// server/api/request.ts
import { courierHandler } from "@noverax/courier-nuxt"
import { sources } from "~/api/sources"

export default courierHandler({ sources })
```

**2. Composable** — use with any state management:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "~/api/sources"
import { boundary } from "~/api/boundary"

export function useCaller() {
  // useAsyncData runs on the server first, where a relative path has no page to resolve against
  const { origin } = useRequestURL()
  return createProxyCaller<typeof api>("api", { boundary, proxyPath: { http: `${origin}/api/request` } })
}
```

**3. Components:**

```vue
<!-- pages/users.vue -->
<script setup lang="ts">
const caller = useCaller()

const { data: users, status } = await useAsyncData("users", () =>
  caller.users.getAll()
)
</script>

<template>
  <div>
    <p v-if="status === 'pending'">Loading...</p>
    <ul v-else>
      <li v-for="user in users" :key="user.id">{{ user.name }}</li>
    </ul>
  </div>
</template>
```

**4. Server-side** — direct calls in Nitro:

```ts
// server/api/dashboard.ts
import { createCaller } from "@noverax/courier"
import { api } from "~/api/sources"

const caller = createCaller(api)

export default defineEventHandler(async () => {
  const users = await caller.users.getAll()
  return { users }
})
```

</details>

<a id="react"></a>
<details>
<summary><img src="https://api.iconify.design/logos/react.svg" height="16" align="center" />&nbsp;&nbsp;<strong>React</strong> — Vite, CRA or any bundler, with React Query</summary>

<br />

Works with any React setup. Pair with Express, Hono, or Fastify on the server side.

**1. Caller with React Query:**

```ts
// lib/query.ts — calls /api/request on your server (see Server Adapters)
import { createProxyQueryCaller } from "@noverax/courier-react"
import type { api } from "../api/sources"
import { boundary } from "../api/boundary"

export const q = createProxyQueryCaller<typeof api>("api", { boundary })
```

**2. Components:**

```tsx
import { q } from "./lib/query"
import { QueryClient, QueryClientProvider } from "@noverax/courier-react"

const queryClient = new QueryClient()

function Users() {
  const { data: users } = q.users.useQuery("getAll")
  const { mutate } = q.users.useMutation("create")

  return (
    <ul>
      {users?.map((u) => <li key={u.id}>{u.name}</li>)}
      <button onClick={() => mutate({ name: "Jane", email: "jane@test.com" })}>Add</button>
    </ul>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Users />
    </QueryClientProvider>
  )
}
```

</details>

<a id="vue"></a>
<details>
<summary><img src="https://api.iconify.design/logos/vue.svg" height="16" align="center" />&nbsp;&nbsp;<strong>Vue</strong> — the core caller with <code>ref</code>, <code>reactive</code> or any composable</summary>

<br />

The core caller is framework-agnostic — use it with `ref`, `reactive`, or any Vue composable.

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "@/api/sources"
import { boundary } from "@/api/boundary"

export const caller = createProxyCaller<typeof api>("api", { boundary })
```

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue"
import type { User } from "@/api/sources"
import { caller } from "@/composables/useCaller"

const users = ref<User[]>([])
const loading = ref(true)

onMounted(async () => {
  users.value = await caller.users.getAll()
  loading.value = false
})

async function createUser(name: string, email: string) {
  const user = await caller.users.create({ name, email })
  users.value.push(user)
}
</script>

<template>
  <p v-if="loading">Loading...</p>
  <ul v-else>
    <li v-for="user in users" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

> **Tip:** For Vue + TanStack Query, use `@tanstack/vue-query` with `caller.users.getAll()` as your `queryFn`.

</details>

<a id="svelte"></a>
<details>
<summary><img src="https://api.iconify.design/logos/svelte-icon.svg" height="16" align="center" />&nbsp;&nbsp;<strong>Svelte</strong> — the core caller in a component</summary>

<br />

```ts
// lib/caller.ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "./api/sources"
import { boundary } from "./api/boundary"

export const caller = createProxyCaller<typeof api>("api", { boundary })
```

```svelte
<!-- routes/users/+page.svelte -->
<script lang="ts">
  import type { User } from "$lib/api/sources"
  import { caller } from "$lib/caller"
  import { onMount } from "svelte"

  let users = $state<User[]>([])

  onMount(async () => {
    users = await caller.users.getAll()
  })
</script>

{#each users as user (user.id)}
  <p>{user.name}</p>
{/each}
```

</details>

<a id="server-adapters"></a>
<details>
<summary><strong>Server adapters</strong> — Hono, Express, Fastify, NestJS</summary>

<br />

Each adapter exposes a single handler that plugs into your server framework. All of them take the same config as `createHandler`, so each is given the same `sources` object the same way: `{ sources }`. Left out, they read the sources `registerSources()` or `attachRuntime()` registered.

#### <img src="https://api.iconify.design/logos/hono.svg" height="16" align="center" />&nbsp;&nbsp;Hono

```ts
import { Hono } from "hono"
import { courierHandler } from "@noverax/courier-hono"
import { sources } from "./api/sources"

const app = new Hono()

app.all("/api/request", courierHandler({ sources }))

export default app
```

#### <img src="https://api.iconify.design/logos/express.svg" height="16" align="center" />&nbsp;&nbsp;Express

```ts
import express from "express"
import { courierHandler } from "@noverax/courier-express"
import { sources } from "./api/sources"

const app = express()

app.all("/api/request", courierHandler({ sources }))

app.listen(3000)
```

#### <img src="https://api.iconify.design/logos/fastify-icon.svg" height="16" align="center" />&nbsp;&nbsp;Fastify

```ts
import Fastify from "fastify"
import { courierPlugin } from "@noverax/courier-fastify"
import { sources } from "./api/sources"

const app = Fastify()

app.register(courierPlugin, { prefix: "/api/request", config: { sources } })

app.listen({ port: 3000 })
```

#### <img src="https://api.iconify.design/logos/nestjs.svg" height="16" align="center" />&nbsp;&nbsp;NestJS

```ts
import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common"
import { courierMiddleware } from "@noverax/courier-nestjs"
import { sources } from "./api/sources"

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(courierMiddleware({ sources })).forRoutes("/api/request")
  }
}
```

</details>

<br />

## Middleware

Composable middleware chain with built-in utilities.

```ts
import { defineApi } from "@noverax/courier/define"
import {
  retryMiddleware,
  authMiddleware,
  logMiddleware,
} from "@noverax/courier/middleware"

const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [
    retryMiddleware({ limit: 3, delay: 300 }), // waits 300 ms, then 600, then 1200
    authMiddleware({
      getToken: () => localStorage.getItem("token") ?? "",
      refreshToken: () => refreshAccessToken(), // renews the token; the call is sent again once on a 401
    }),
    logMiddleware(),
  ],
  groups: { users },
})
```

## Runtime validation

Works with any [Standard Schema](https://github.com/standard-schema/standard-schema) library — Zod, Valibot, ArkType.

```ts
import { courier, defineGroup } from "@noverax/courier/define"
import { z } from "zod"

const { endpoint } = courier()

const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.email() })
const CreateUserSchema = z.object({ name: z.string().min(1), email: z.email() })

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response(z.array(UserSchema)),
    create: endpoint.post("").variables(CreateUserSchema).response(UserSchema),
  },
})
```

## Testing

In-memory test client with mock builder — no network, no setup.

```ts
import { createTestClient } from "@noverax/courier/testing"
import type { api } from "./api/sources"

const { client, mock, history } = createTestClient<typeof api>()
const alice = { id: "1", name: "Alice", email: "alice@example.com" }

// Mock responses
mock("users", "getAll").resolves([alice])
mock("users", "create").returns((vars) => ({ id: "2", ...vars }))
mock("users", "remove").rejects(404, { message: "Not found" })

// Use like the real caller
const users = await client.users.getAll()

// Assert on request history
expect(history).toHaveLength(1)
expect(history[0].group).toBe("users")
expect(history[0].method).toBe("getAll")

// Lifecycle control — the mock registered last answers first
mock("users", "getAll").resolves([alice]).delay(100) // every call, after 100 ms
mock("users", "getAll").resolves([]).once()          // the next call only
```

<br />

## Courier Studio

A development server for the project's API: every call your app makes, live, with its timing and middleware; a playground for any endpoint, direct or through the proxy; OpenAPI and Postman import that writes the definition for you; and the mock servers from `courier.mocks.ts`, which keep their records across restarts.

```bash
npm install --save-dev @noverax/courier-studio
npx courier-studio
```

See [`@noverax/courier-studio`](./packages/studio) for setup and [How Studio loads the project](https://courier.noverax.cloud/docs/studio/project-loading).

<br />

## Comparison

| | fetch | axios | tRPC | **Courier** |
| --- | :---: | :---: | :---: | :---: |
| End-to-end type safety | — | — | ✓ | **✓** |
| No custom backend required | ✓ | ✓ | — | **✓** |
| Framework agnostic | ✓ | ✓ | ✓ | **✓** |
| React Query integration | — | — | ✓ | **✓** |
| Server Components | Manual | Manual | ✓ | **First-class** |
| Server Actions | — | — | Experimental | **Built-in** |
| Middleware chain | — | Interceptors | Middleware | **Composable** |
| Runtime validation | — | — | Any validator | **Any Standard Schema** |
| Upload progress | — | ✓ | — | **Built-in** |
| Path parameters | Manual | Manual | — | **Built-in** |
| Streaming & SSE | Manual | Manual | ✓ | **First-class** |
| In-memory mock client | — | — | — | **Built-in** |

<details>
<summary><strong>Closer alternatives</strong> — oRPC, ts-rest, openapi-fetch, Hey API, ofetch</summary>

<br />

- **[oRPC](https://orpc.unnoq.com)** types each call from an oRPC router or contract that your server implements, and adds OpenAPI generation, event-iterator streams, Server Actions and TanStack Query. Courier types calls to a backend it does not own: FastAPI, Rails, Go or a third-party API.
- **[ts-rest](https://ts-rest.com)** shares one REST contract between client and server, typed or validated with any Standard Schema library. Courier keeps one definition too, and builds on it: proxy mode, SSE and WebSocket channels, a mock server and Studio.
- **[openapi-fetch](https://openapi-ts.dev/openapi-fetch/)** is a small fetch client typed from the types `openapi-typescript` generates from a spec, checked at build time only. Courier needs no spec and validates at runtime; Studio imports a spec when there is one.
- **[Hey API](https://heyapi.dev)** generates an SDK from an OpenAPI spec, with plugins for Zod, Valibot and ArkType schemas and TanStack Query hooks. Courier's definition is code you own and edit, with middleware, validation and streams in it.
- **[ofetch](https://github.com/unjs/ofetch)** is a better `fetch` — retries, interceptors, automatic JSON parsing — typed by a generic on each call. Courier types every endpoint from its definition.

</details>

<br />

## Packages

**Core and clients**

| Package | | |
| --- | --- | --- |
| [`@noverax/courier`](./packages/core) | Caller factories, HTTP client, middleware, validation, realtime, testing | [![npm](https://img.shields.io/npm/v/@noverax/courier?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier) |
| [`@noverax/courier-react`](./packages/react) | `useQuery`, `useMutation`, `useSuspenseQuery`, `useInfiniteQuery`, `useSubscription`, `useComputedQuery`, `useChannel` | [![npm](https://img.shields.io/npm/v/@noverax/courier-react?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-react) |
| [`@noverax/courier-next`](./packages/next) | `apiRoute` handler and `createAction` for Server Actions | [![npm](https://img.shields.io/npm/v/@noverax/courier-next?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-next) |

**Server adapters**

| Package | | |
| --- | --- | --- |
| [`@noverax/courier-express`](./packages/express) | Express middleware | [![npm](https://img.shields.io/npm/v/@noverax/courier-express?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-express) |
| [`@noverax/courier-fastify`](./packages/fastify) | Fastify plugin | [![npm](https://img.shields.io/npm/v/@noverax/courier-fastify?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-fastify) |
| [`@noverax/courier-hono`](./packages/hono) | Hono handler, Web Standard | [![npm](https://img.shields.io/npm/v/@noverax/courier-hono?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-hono) |
| [`@noverax/courier-nestjs`](./packages/nestjs) | NestJS middleware | [![npm](https://img.shields.io/npm/v/@noverax/courier-nestjs?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-nestjs) |
| [`@noverax/courier-nuxt`](./packages/nuxt) | Nuxt, Nitro and h3 event handler | [![npm](https://img.shields.io/npm/v/@noverax/courier-nuxt?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-nuxt) |
| [`@noverax/courier-astro`](./packages/astro) | Astro API endpoint | [![npm](https://img.shields.io/npm/v/@noverax/courier-astro?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-astro) |
| [`@noverax/courier-remix`](./packages/remix) | Remix and React Router loaders and actions | [![npm](https://img.shields.io/npm/v/@noverax/courier-remix?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-remix) |
| [`@noverax/courier-solid`](./packages/solid) | SolidStart adapter and Solid primitives | [![npm](https://img.shields.io/npm/v/@noverax/courier-solid?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-solid) |
| [`@noverax/courier-sveltekit`](./packages/sveltekit) | SvelteKit endpoint | [![npm](https://img.shields.io/npm/v/@noverax/courier-sveltekit?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-sveltekit) |
| [`@noverax/courier-server`](./packages/server) | Standalone HTTP, SSE and WebSocket server | [![npm](https://img.shields.io/npm/v/@noverax/courier-server?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-server) |
| [`@noverax/courier-redis`](./packages/redis) | Redis pub/sub for WebSocket across replicas | [![npm](https://img.shields.io/npm/v/@noverax/courier-redis?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-redis) |

**Development**

| Package | | |
| --- | --- | --- |
| [`@noverax/courier-studio`](./packages/studio) | Studio — request inspector, playground, OpenAPI import, mock servers | [![npm](https://img.shields.io/npm/v/@noverax/courier-studio?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-studio) |
| [`@noverax/courier-studio-core`](./packages/studio-core) | Studio runtime — `attachRuntime` for your instrumentation | [![npm](https://img.shields.io/npm/v/@noverax/courier-studio-core?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-studio-core) |
| [`@noverax/courier-mock`](./packages/mock) | Mock servers, test utilities, contract testing and fixtures | [![npm](https://img.shields.io/npm/v/@noverax/courier-mock?style=flat-square&label=&labelColor=08090a&color=1c63d6)](https://www.npmjs.com/package/@noverax/courier-mock) |

<br />

## Documentation

Guides, the API reference and examples live at **[courier.noverax.cloud](https://courier.noverax.cloud)**.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change, and read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)

<br />

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logos/courier-mark-light.svg" />
    <source media="(prefers-color-scheme: light)" srcset="docs/public/logos/courier-mark-dark.svg" />
    <img alt="Courier" src="docs/public/logos/courier-mark-dark.svg" height="20" />
  </picture>
  <br />
  <sub>Built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
