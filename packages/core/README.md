<div align="center">
  <br />

  # @noverax/nexus

  **Core package — type-safe API client with zero runtime dependencies.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus"><img src="https://img.shields.io/npm/v/@noverax/nexus?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/nexus"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/nexus?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

  <br />
</div>

<br />

## Overview

The core package provides everything you need to define, call, and test your API endpoints with full type safety. It works in any JavaScript runtime — Node.js, Bun, Deno, browsers, Cloudflare Workers.

**Zero runtime dependencies** (only `@standard-schema/spec` for validation types). Built on native `fetch`.

<br />

## Install

```bash
npm install @noverax/nexus
```

<br />

## Exports

The core package exposes five entry points:

### `@noverax/nexus` — Main

```ts
import {
  createCaller,          // Universal factory — call endpoints directly from any runtime
  createProxyCaller,     // Proxy factory — browser → server → backend
  createHandler,         // Web Standard adapter handler for server frameworks
  HTTPError,             // Typed HTTP error with status, headers, data
  isHTTPError,           // Type guard for HTTPError
  executeRequest,        // Core request orchestrator (used by adapters internally)
} from "@noverax/nexus"
```

### `@noverax/nexus/define` — API Definition

```ts
import {
  defineApi,       // Create an API source with base URL and groups
  defineGroup,     // Create an endpoint group with prefix and typed endpoints
  endpoint,        // Type-safe endpoint factory with optional schema validation
} from "@noverax/nexus/define"
```

### `@noverax/nexus/middleware` — Middleware Chain

```ts
import {
  defineMiddleware,      // Create a typed middleware function
  composeMiddleware,     // Compose multiple middleware into one
  retryMiddleware,       // Automatic retry with backoff
  authMiddleware,        // Token injection + refresh
  logMiddleware,         // Request/response logging
  rateLimitMiddleware,   // Client-side rate limiting
  cacheMiddleware,       // In-memory response caching
} from "@noverax/nexus/middleware"
```

### `@noverax/nexus/testing` — Test Utilities

```ts
import {
  createTestClient,  // In-memory mock client with history tracking
  findRequests,       // Filter request history by source/endpoint
} from "@noverax/nexus/testing"
```

### `@noverax/nexus/node` — Node.js Helpers

```ts
import {
  toWebRequest,      // Convert Node.js IncomingMessage → Web Request
  sendWebResponse,   // Send Web Response → Node.js ServerResponse
} from "@noverax/nexus/node"
```

<br />

## Quick Start

### 1. Define your API

```ts
import { defineApi, defineGroup, endpoint } from "@noverax/nexus/define"

type User = { id: string; name: string; email: string }

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll:  endpoint<User[]>()((http) => http.get()),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
    create:  endpoint<User, { name: string; email: string }>()((http, vars) => http.post("", vars)),
  },
})

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { users },
})

export const sources = { api }
export type Sources = typeof sources
```

### 2. Call endpoints

**Direct mode** — works anywhere with `fetch`:

```ts
import { createCaller } from "@noverax/nexus"
import { sources } from "./api/sources"

const call = createCaller(sources)

const users = await call("api")("users:getAll")
//    ^? User[]

const user = await call("api")("users:getById", { id: "1" })
//    ^? User
```

**Proxy mode** — browser → server → backend:

```ts
import { createProxyCaller } from "@noverax/nexus"
import type { Sources } from "./api/sources"

const call = createProxyCaller<Sources>({ proxyUrl: "/api/request" })

const users = await call("api")("users:getAll")
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
    getAll: endpoint({ response: z.array(UserSchema) })((http) => http.get()),
    create: endpoint({
      response: UserSchema,
      variables: z.object({ name: z.string().min(1), email: z.string().email() }),
    })((http, vars) => http.post("", vars)),
  },
})
```

<br />

## Testing

```ts
import { createTestClient } from "@noverax/nexus/testing"

const { caller, mock, history, reset } = createTestClient<Sources>()

mock("api", "users:getAll").resolves([{ id: "1", name: "Alice", email: "alice@test.com" }])

const users = await caller("api")("users:getAll")
expect(users).toHaveLength(1)
expect(history).toHaveLength(1)
expect(history[0].endpoint).toBe("users:getAll")

// Mock lifecycle
mock("api", "users:getAll").resolves("once").once()         // consumed after 1 call
mock("api", "users:getAll").resolves("data").times(3)        // consumed after 3 calls
mock("api", "slow").resolves("done").delay(100)              // artificial delay
mock("api", "fail").rejects(500, { message: "Error" })       // mock errors
```

<br />

## Building Server Adapters

The `createHandler` function returns a Web Standard handler. All official adapters use it internally:

```ts
import { createHandler } from "@noverax/nexus"
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
