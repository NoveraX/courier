<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-logo-horizontal-light.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-logo-horizontal-dark.png" />
    <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-logo-horizontal-dark.png" height="48" />
  </picture>

  <br />
  <br />

  <p><strong>Type-safe API client for any framework. Define once, call anywhere.</strong></p>
  <p>End-to-end type safety from API definition to UI — no codegen, no schema files, no custom backend.</p>

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier"><img src="https://img.shields.io/npm/v/@noverax/courier?color=7c3aed&label=npm&style=flat-square" alt="npm version" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white&style=flat-square" alt="TypeScript" /></a>
  <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="License: MIT" /></a>
  <a href="https://bundlephobia.com/package/@noverax/courier"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/courier?color=f59e0b&label=size&style=flat-square" alt="Bundle Size" /></a>

  <br />
  <br />

  <code>Next.js</code> &nbsp; <code>Nuxt</code> &nbsp; <code>React</code> &nbsp; <code>Vue</code> &nbsp; <code>Hono</code> &nbsp; <code>Express</code> &nbsp; <code>Fastify</code> &nbsp; <code>NestJS</code> &nbsp; <code>Node.js</code> &nbsp; <code>Bun</code> &nbsp; <code>Deno</code>

  <br />
  <br />

  <a href="https://courier.noverax.cloud">Documentation</a> &nbsp;&nbsp;|&nbsp;&nbsp; <a href="https://courier.noverax.cloud/docs/examples/basic">Examples</a> &nbsp;&nbsp;|&nbsp;&nbsp; <a href="https://github.com/NoveraX/courier">GitHub</a>
</div>

<br />

---

<br />

## Why Courier

Most HTTP clients stop at "send a request, get a response." You still write boilerplate for every endpoint, duplicate types between client and server, and glue together validation, caching, and error handling yourself.

Courier takes a different approach. You **define your API once** as plain TypeScript functions — and get autocomplete, type inference, runtime validation, middleware, and framework adapters out of the box. It works with **any REST backend** (Express, FastAPI, Rails, Go, Laravel — anything that speaks HTTP).

<br />

### Key Capabilities

- 🔒 **End-to-end type safety** — response types, variables, endpoint names — all inferred. Zero codegen.
- 🌍 **Framework agnostic** — core runs on any runtime with `fetch`. Adapters for Next.js, Nuxt, Hono, Express, Fastify, NestJS.
- 🔀 **Two transport modes** — **Universal** — call backends from anywhere. **Proxy** — hide secrets, bypass CORS, forward cookies.
- 🧩 **Middleware chain** — retry, auth, logging, rate-limiting, caching — composable, type-safe, or write your own.
- 🛡️ **Runtime validation** — plug in Zod, Valibot, ArkType, or any Standard Schema library. Validate on both sides.
- ⚡ **React Query built-in** — `useQuery`, `useMutation`, `useSuspenseQuery`, `useInfiniteQuery` — fully typed, zero config.
- 🚀 **Server Actions** — Next.js `useActionState` with automatic FormData parsing, revalidation, and error handling.
- 📤 **Upload progress** — real network-level tracking via XHR. Works on HTTP/1.1 and HTTP/2.
- 📡 **Streaming & SSE** — first-class stream response support with typed error handling.
- 🧪 **Testing utilities** — in-memory test client with mock builder, request history, and delay simulation.

<br />

---

<br />

## Install

```bash
npm install @noverax/courier
```

<details>
<summary><strong>Framework-specific packages</strong></summary>
<br />

```bash
# React Query integration
npm install @noverax/courier-react @tanstack/react-query

# Next.js (API routes + Server Actions)
npm install @noverax/courier-next

# Server adapters — install only what you use
npm install @noverax/courier-express    # Express
npm install @noverax/courier-fastify    # Fastify
npm install @noverax/courier-hono       # Hono
npm install @noverax/courier-nestjs     # NestJS
npm install @noverax/courier-nuxt       # Nuxt / Nitro / h3
```

</details>

<br />

---

<br />

## Define Your API

This is shared across all frameworks. Define once — use everywhere.

```ts
// api/sources.ts
import { courier, defineApi, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

type User = { id: string; name: string; email: string }

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    getById: endpoint
      .variables<{ id: string }>()
      .response<User>()
      .get(":id"),
    create: endpoint
      .variables<{ name: string; email: string }>()
      .response<User>()
      .post(""),
    update: endpoint
      .variables<{ id: string; name: string }>()
      .response<User>()
      .put(":id"),
    remove: endpoint
      .variables<{ id: string }>()
      .response<null>()
      .del(":id"),
  },
})

export const api = defineApi({
  baseURL: process.env.API_URL!,
  groups: { users },
})
```

<br />

---

<br />

## Framework Guides

<br />

### <img src="https://api.iconify.design/logos/nextjs-icon.svg" height="20" align="center" />&nbsp;&nbsp;Next.js

Full-stack setup with proxy route, React Query hooks, Server Components, and Server Actions.

**1. Proxy route** — single route handles all endpoints:

```ts
// app/api/request/route.ts
import { apiRoute } from "@noverax/courier-next"
import { sources } from "@/api/sources"

export const { GET, POST } = apiRoute(sources)
```

**2. Client caller** — React Query hooks with full type inference:

```ts
// lib/query.ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import type { api } from "@/api/sources"

export const q = createProxyQueryCaller<typeof api>("api")
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
import { createAction } from "@noverax/courier-next"
import { sources } from "@/api/sources"

const action = createAction(sources)

export const createUser = action("api")("users:create", {
  revalidatePath: "/users",
})
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

<br />

---

### <img src="https://api.iconify.design/logos/nuxt-icon.svg" height="20" align="center" />&nbsp;&nbsp;Nuxt

**1. Server route** — Nitro/h3 event handler:

```ts
// server/api/request.ts
import { courierHandler } from "@noverax/courier-nuxt"
import { sources } from "~/api/sources"

export default courierHandler(sources)
```

**2. Composable** — use with any state management:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import { api } from "~/api/sources"

export const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
```

**3. Components:**

```vue
<!-- pages/users.vue -->
<script setup lang="ts">
import { caller } from "~/composables/useCaller"

const { data: users, status } = useAsyncData("users", () =>
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

<br />

---

### <img src="https://api.iconify.design/logos/react.svg" height="20" align="center" />&nbsp;&nbsp;React (Vite / CRA / any bundler)

Works with any React setup. Pair with Express, Hono, or Fastify on the server side.

**1. Caller with React Query:**

```ts
// lib/query.ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import type { api } from "./api/sources"

export const q = createProxyQueryCaller<typeof api>("api", {
  source: api,
  proxyPath: { http: "/api/request" }, // points to your backend proxy route
})
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

<br />

---

### <img src="https://api.iconify.design/logos/vue.svg" height="20" align="center" />&nbsp;&nbsp;Vue

The core caller is framework-agnostic — use it with `ref`, `reactive`, or any Vue composable.

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import { api } from "@/api/sources"

export const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
```

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue"
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

<br />

---

### <img src="https://api.iconify.design/logos/svelte-icon.svg" height="20" align="center" />&nbsp;&nbsp;Svelte

```ts
// lib/caller.ts
import { createProxyCaller } from "@noverax/courier"
import { api } from "./api/sources"

export const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
```

```svelte
<!-- routes/users/+page.svelte -->
<script lang="ts">
  import { caller } from "$lib/caller"
  import { onMount } from "svelte"

  let users = $state([])

  onMount(async () => {
    users = await caller.users.getAll()
  })
</script>

{#each users as user (user.id)}
  <p>{user.name}</p>
{/each}
```

<br />

---

### Server Adapters

Each adapter exposes a single handler that plugs into your server framework. All of them use the same `sources` object.

<br />

#### <img src="https://api.iconify.design/logos/hono.svg" height="16" align="center" />&nbsp;&nbsp;Hono

```ts
import { Hono } from "hono"
import { courierHandler } from "@noverax/courier-hono"
import { sources } from "./api/sources"

const app = new Hono()

app.all("/api/request", courierHandler(sources))

export default app
```

#### <img src="https://api.iconify.design/logos/express.svg" height="16" align="center" />&nbsp;&nbsp;Express

```ts
import express from "express"
import { courierHandler } from "@noverax/courier-express"
import { sources } from "./api/sources"

const app = express()

app.all("/api/request", courierHandler(sources))

app.listen(3000)
```

#### <img src="https://api.iconify.design/logos/fastify-icon.svg" height="16" align="center" />&nbsp;&nbsp;Fastify

```ts
import Fastify from "fastify"
import { courierPlugin } from "@noverax/courier-fastify"
import { sources } from "./api/sources"

const app = Fastify()

app.register(courierPlugin, { sources, prefix: "/api/request" })

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
    consumer.apply(courierMiddleware(sources)).forRoutes("/api/request")
  }
}
```

<br />

#### Universal (Node.js / Bun / Deno)

The core caller works in any JavaScript runtime — no framework required.

```ts
import { createCaller } from "@noverax/courier"
import { api } from "./api/sources"

const caller = createCaller(api)

// Works in Node.js, Bun, Deno, Cloudflare Workers — anywhere with fetch
const users = await caller.users.getAll()
const user = await caller.users.getById({ id: "1" })
```

<br />

---

<br />

## Advanced Features

### Middleware

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
    retryMiddleware({ limit: 3, backoff: "exponential" }),
    authMiddleware({
      getToken: () => localStorage.getItem("token"),
      refreshToken: async () => { /* refresh logic */ },
    }),
    logMiddleware(),
  ],
  groups: { users },
})
```

### Runtime Validation

Works with any [Standard Schema](https://github.com/standard-schema/standard-schema) library — Zod, Valibot, ArkType.

```ts
import { courier } from "@noverax/courier/define"
import { z } from "zod"

const { endpoint } = courier()

const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.email() })
const CreateUserSchema = z.object({ name: z.string().min(1), email: z.email() })

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.response(z.array(UserSchema)).get(""),
    create: endpoint.variables(CreateUserSchema).response(UserSchema).post(""),
  },
})
```

### Testing

In-memory test client with mock builder — no network, no setup.

```ts
import { createTestClient } from "@noverax/courier/testing"
import type { api } from "./api/sources"

const { client, mock, history } = createTestClient<typeof api>()

// Mock responses
mock("users", "getAll").resolves([{ id: "1", name: "Alice" }])
mock("users", "create").returns((vars) => ({ id: "2", ...vars }))
mock("users", "remove").rejects(404, { message: "Not found" })

// Use like the real caller
const users = await client.users.getAll()

// Assert on request history
expect(history).toHaveLength(1)
expect(history[0].group).toBe("users")
expect(history[0].method).toBe("getAll")

// Lifecycle control
mock("users", "getAll").resolves("first").once()
mock("users", "getAll").resolves("done").delay(100)
```

<br />

---

<br />

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Your Backend               │
                         │     (Express, FastAPI, Rails, Go…)      │
                         └───────────────────┬─────────────────────┘
                                             │
                    ┌───────────────────────┐│┌────────────────────────┐
                    │                       │││                        │
              ┌─────▼──────┐          ┌─────▼▼─────┐                   │
              │ Universal  │          │   Proxy    │                   │
              │  (server)  │          │  (browser) │                   │
              └─────┬──────┘          └─────┬──────┘                   │
                    │                       │                          │
           createCaller(api)      createProxyCaller()                │
                    │                       │                          │
                    │                  POST /api/request               │
                    │                       │                          │
                    │               ┌───────▼────────┐                 │
                    │               │ Server Adapter  │                │
                    │               │ (Next, Hono,    │                │
                    │               │  Express, etc.) │                │
                    │               └───────┬────────┘                 │
                    │                       │                          │
                    └───────────┬───────────┘                          │
                                │                                      │
                       ┌────────▼──────────┐                           │
                       │  executeRequest   │────── middleware chain ───┘
                       │  (core engine)    │────── schema validation
                       └────────┬──────────┘
                                │
                         native fetch()
```

**Universal mode** — server-side code calls your backend directly. Zero overhead, full type safety.

**Proxy mode** — browser sends requests through your server, which hides API keys, bypasses CORS, and forwards cookies automatically.

Both modes share the same API definition, the same middleware chain, and the same type inference.

<br />

---

<br />

## Comparison

| Feature | fetch | axios | tRPC | **Courier** |
| --- | :---: | :---: | :---: | :---: |
| End-to-end type safety | - | - | Yes | **Yes** |
| No custom backend required | Yes | Yes | - | **Yes** |
| Framework agnostic | Yes | Yes | - | **Yes** |
| React Query integration | - | - | Yes | **Yes** |
| Server Components | Manual | - | Limited | **First-class** |
| Server Actions | - | - | - | **Built-in** |
| Middleware chain | - | Interceptors | Middleware | **Composable** |
| Runtime validation | - | - | Zod only | **Any Standard Schema** |
| Upload progress | - | Yes | Plugin | **Built-in** |
| Path parameters | Manual | Manual | - | **Built-in** |
| Request deduplication | - | - | - | **Built-in** |
| Streaming & SSE | Manual | - | Experimental | **First-class** |
| Test utilities | - | - | - | **Built-in** |

<br />

---

<br />

## Packages

| Package | Description | |
| --- | --- | --- |
| [`@noverax/courier`](./packages/core) | Core — caller factories, HTTP client, middleware, validation, testing | [![npm](https://img.shields.io/npm/v/@noverax/courier?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier) |
| [`@noverax/courier-react`](./packages/react) | React hooks — `useQuery`, `useMutation`, `useSuspenseQuery`, `useInfiniteQuery`, `useSubscription` | [![npm](https://img.shields.io/npm/v/@noverax/courier-react?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-react) |
| [`@noverax/courier-next`](./packages/next) | Next.js — `apiRoute` handler + `createAction` for Server Actions | [![npm](https://img.shields.io/npm/v/@noverax/courier-next?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-next) |
| [`@noverax/courier-express`](./packages/express) | Express middleware adapter | [![npm](https://img.shields.io/npm/v/@noverax/courier-express?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-express) |
| [`@noverax/courier-fastify`](./packages/fastify) | Fastify plugin adapter | [![npm](https://img.shields.io/npm/v/@noverax/courier-fastify?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-fastify) |
| [`@noverax/courier-hono`](./packages/hono) | Hono Web Standard adapter | [![npm](https://img.shields.io/npm/v/@noverax/courier-hono?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-hono) |
| [`@noverax/courier-nestjs`](./packages/nestjs) | NestJS middleware adapter | [![npm](https://img.shields.io/npm/v/@noverax/courier-nestjs?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-nestjs) |
| [`@noverax/courier-nuxt`](./packages/nuxt) | Nuxt / Nitro / h3 event handler adapter | [![npm](https://img.shields.io/npm/v/@noverax/courier-nuxt?color=7c3aed&style=flat-square&label=)](https://www.npmjs.com/package/@noverax/courier-nuxt) |

<br />

---

<br />

## Documentation

Full documentation with interactive examples at **[courier.noverax.cloud](https://courier.noverax.cloud)**.

<br />

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

<br />

## License

[MIT](./LICENSE)

<br />

<div align="center">
  <sub>Built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
