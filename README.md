<div align="center">

# @noverax/nexus

**Type-safe HTTP client for Next.js — define once, use everywhere.**

[![npm version](https://img.shields.io/npm/v/@noverax/nexus?color=blue&label=npm)](https://www.npmjs.com/package/@noverax/nexus)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/NoveraX/nexus/blob/main/LICENSE)

[Documentation](https://nexus.noverax.cloud) · [Examples](https://nexus.noverax.cloud/docs/examples/basic) · [GitHub](https://github.com/NoveraX/nexus)

</div>

---

Nexus is an HTTP client library designed for Next.js applications. It provides end-to-end type safety from your API definition to your React components — without code generation, schema files, or a custom backend.

Define your API as TypeScript classes. Nexus infers request and response types automatically, giving you autocomplete for method names, variables, and response shapes.

## Features

- 🔒 **End-to-end type safety** — no codegen, no schema files. TypeScript classes are the source of truth
- 🔀 **Two transport modes** — proxy (browser → API route → backend) and direct (server → backend)
- ⚡ **React Query integration** — `useQuery` and `useMutation` with full type inference out of the box
- 🛣️ **One proxy route for all endpoints** — single `apiRoute(sources)` replaces per-endpoint API routes
- 📤 **File upload with progress** — built-in XHR-based upload tracking
- 🔗 **Path parameters** — `:id` syntax with automatic resolution from variables
- 🚫 **Request deduplication** — automatic AbortController management
- 📡 **Streaming & SSE** — first-class stream response support
- 🪝 **Lifecycle hooks** — `onRequest`, `onResponse`, `onError` at the datasource level
- 🌐 **Works with any REST backend** — Express, FastAPI, Rails, Go, or any HTTP API

## Install

```bash
npm install @noverax/nexus
```

Peer dependencies (all optional — install only what you use):

```bash
# Required for proxy mode
npm install next

# Required for React Query integration
npm install @tanstack/react-query
```

## Quick Start

### 1. Define your API

```ts
// api/sources.ts
import { Datasource, EndpointGroup, Endpoint } from "@noverax/nexus/datasource"

type User = { id: number; name: string; email: string }

class Users extends EndpointGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Endpoint<User[]> = ({ get }) => get()
  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id")
  create: Endpoint<User, { name: string; email: string }> = ({ post }) => post()
  update: Endpoint<User, { id: number; name: string }> = ({ put }) => put(":id")
  remove: Endpoint<null, { id: number }> = ({ del }) => del(":id")
}

class MyApi extends Datasource<{ users: Users }> {
  constructor() {
    super({
      baseURL: process.env.API_URL!,
      groups: { users: new Users() },
    })
  }
}

export const sources = { myApi: new MyApi() }
export type Sources = typeof sources
```

### 2. Set up the transport

**Proxy mode** — create an API route and a client:

```ts
// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus/next/apiRoute"
import { sources } from "@/api/sources"

export const { POST } = apiRoute(sources)
```

```ts
// lib/request.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api/sources"

export const { useQuery, useMutation, request } = createQueryRequest<Sources>()
```

**Direct mode** — for Server Components and Server Actions:

```ts
// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api/sources"

export const directRequest = createDirectRequest(sources)
```

### 3. Use in components

**Client component** with React Query:

```tsx
"use client"
import { useQuery, useMutation } from "@/lib/request"

export default function UsersPage() {
  const { data, isLoading } = useQuery("myApi", "users:getAll")
  //      ^? User[]

  const { mutate } = useMutation("myApi", "users:create", {
    onSuccess: (user) => console.log("Created:", user.name),
    //                                          ^? string
  })

  if (isLoading) return <p>Loading...</p>

  return (
    <ul>
      {data?.map((user) => <li key={user.id}>{user.name}</li>)}
      <button onClick={() => mutate({ name: "Jane", email: "jane@test.com" })}>
        Add User
      </button>
    </ul>
  )
}
```

**Server component** with direct mode:

```tsx
// app/dashboard/page.tsx
import { directRequest } from "@/lib/direct-request"

export default async function DashboardPage() {
  const users = await directRequest("myApi")("users:getAll")
  //    ^? User[]

  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
}
```

## How It Works

Nexus supports two transport modes, both sharing the same API definition:

```
Proxy Mode (browser):
  Browser → POST /api/request → Next.js API Route → HttpClient → Backend

Direct Mode (server):
  Server Component → HttpClient → Backend
```

**Proxy mode** hides secrets, bypasses CORS, and forwards cookies automatically. The browser only sees `/api/request`.

**Direct mode** skips the proxy hop entirely — server-side code calls the backend directly with zero overhead.

## Comparison

| Feature | fetch | axios | tRPC | **Nexus** |
| --- | --- | --- | --- | --- |
| Type Safety | Manual | Manual | Full | **Full** |
| React Query | Manual | Manual | Built-in | **Built-in** |
| Server Components | Manual | No | Limited | **First-class** |
| Request Grouping | No | No | Router | **EndpointGroup** |
| Upload Progress | No | Yes | Plugin | **Built-in** |
| Path Parameters | Manual | Manual | No | **Built-in** |
| Backend Requirement | Any | Any | tRPC server | **Any REST** |

## Exports

| Import | Description |
| --- | --- |
| `@noverax/nexus` | `createClientRequest`, `HTTPError`, `isHTTPError` |
| `@noverax/nexus/datasource` | `Datasource`, `EndpointGroup`, `Endpoint` |
| `@noverax/nexus/direct` | `createDirectRequest` |
| `@noverax/nexus/next/apiRoute` | `apiRoute` |
| `@noverax/nexus/query` | `createQueryRequest`, `QueryClient`, `QueryClientProvider` |

## Documentation

Full documentation with interactive examples is available at **[nexus.noverax.cloud](https://nexus.noverax.cloud)**.

- [Introduction](https://nexus.noverax.cloud/docs/introduction) — what Nexus is and why
- [Installation](https://nexus.noverax.cloud/docs/installation) — setup guide
- [Quick Start](https://nexus.noverax.cloud/docs/quick-start) — first request in 4 steps
- [Architecture](https://nexus.noverax.cloud/docs/architecture) — how it works under the hood
- [Examples](https://nexus.noverax.cloud/docs/examples/basic) — interactive demos of every feature

## License

[MIT](./LICENSE)
