<div align="center">
  <br />

  # @noverax/courier

  **Core package — type-safe API client with zero runtime dependencies.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier"><img src="https://img.shields.io/npm/v/@noverax/courier?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/courier"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/courier?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

  <br />
</div>

<br />

## Overview

The core package provides everything you need to define, call, and test your API endpoints with full type safety. It works in any JavaScript runtime — Node.js, Bun, Deno, browsers, Cloudflare Workers.

**Zero runtime dependencies** (only `@standard-schema/spec` for validation types). Built on native `fetch`.

<br />

## Install

```bash
npm install @noverax/courier
```

<br />

## Exports

The core package exposes five entry points:

### `@noverax/courier` — Main

```ts
import {
  createCaller,          // Universal factory — call endpoints directly from any runtime
  createProxyCaller,     // Proxy factory — browser → server → backend
  createHandler,         // Web Standard adapter handler for server frameworks
  HTTPError,             // Typed HTTP error with status, headers, data
  isHTTPError,           // Type guard for HTTPError
  executeRequest,        // Core request orchestrator (used by adapters internally)
} from "@noverax/courier"
```

### `@noverax/courier/define` — API Definition

```ts
import {
  courier,         // Builder heads carrying whatever settings endpoints share
  defineGroup,     // Create an endpoint group with prefix and typed endpoints
  defineApi,       // Create an API source with base URL and groups
} from "@noverax/courier/define"
```

### `@noverax/courier/middleware` — Middleware Chain

```ts
import {
  defineMiddleware,      // Create a typed middleware function
  composeMiddleware,     // Compose multiple middleware into one
  retryMiddleware,       // Automatic retry with backoff
  authMiddleware,        // Token injection + refresh
  logMiddleware,         // Request/response logging
  rateLimitMiddleware,   // Client-side rate limiting
  cacheMiddleware,       // In-memory response caching
} from "@noverax/courier/middleware"
```

### `@noverax/courier/testing` — Test Utilities

```ts
import {
  createTestClient,  // In-memory mock client with history tracking
  findRequests,      // Filter request history by group/method
} from "@noverax/courier/testing"
```

### `@noverax/courier/node` — Node.js Helpers

```ts
import {
  toWebRequest,      // Convert Node.js IncomingMessage → Web Request
  sendWebResponse,   // Send Web Response → Node.js ServerResponse
} from "@noverax/courier/node"
```

<br />

## Quick Start

### 1. Define your API

```ts
import { courier, defineApi, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

type User = { id: string; name: string; email: string }

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string }>().response<User>(),
  },
})

export const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { users },
})
```

### 2. Call endpoints

**Direct mode** — works anywhere with `fetch`:

```ts
import { createCaller } from "@noverax/courier"
import { api } from "./api/sources"

const caller = createCaller(api)

const users = await caller.users.getAll()
//    ^? User[]

const user = await caller.users.getById({ id: "1" })
//    ^? User
```

**Proxy mode** — browser → server → backend:

```ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "./api/sources"

const caller = createProxyCaller<typeof api>("api", { source: api, proxyPath: { http: "/api/request" } })

const users = await caller.users.getAll()
```

### 3. Add middleware

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [
    retryMiddleware({ limit: 3 }),
    authMiddleware({ getToken: () => localStorage.getItem("token") }),
  ],
  groups: { users },
})
```

### 4. Add validation

```ts
import { z } from "zod"

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response(z.array(UserSchema)),
    create: endpoint.post("").variables(z.object({ name: z.string().min(1), email: z.email() })).response(UserSchema),
  },
})
```

<br />

## Testing

```ts
import { createTestClient } from "@noverax/courier/testing"
import type { api } from "./api/sources"

const { client, mock, history, reset } = createTestClient<typeof api>()

mock("users", "getAll").resolves([{ id: "1", name: "Alice", email: "alice@test.com" }])

const users = await client.users.getAll()
expect(users).toHaveLength(1)
expect(history).toHaveLength(1)
expect(history[0].group).toBe("users")
expect(history[0].method).toBe("getAll")

// Mock lifecycle
mock("users", "getAll").resolves("once").once()         // consumed after 1 call
mock("users", "getAll").resolves("data").times(3)        // consumed after 3 calls
mock("users", "getAll").resolves("done").delay(100)      // artificial delay
mock("users", "getById").rejects(500, { message: "Error" })  // mock errors
```

<br />

## Building Server Adapters

The `createHandler` function returns a Web Standard handler. All official adapters use it internally:

```ts
import { createHandler } from "@noverax/courier"
import { sources } from "./api/sources"

const handler = createHandler(sources)

// handler.handle(request)    — auto-routes GET/POST
// handler.handleGet(request) — query endpoints only
// handler.handlePost(request) — mutations + data
```

For Node.js servers, use `toWebRequest` and `sendWebResponse` to bridge between Node.js and Web Standard APIs.

<br />

## License

[MIT](../../LICENSE)
