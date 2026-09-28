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

The core package's public entry points:

### `@noverax/courier` — Main

```ts
import {
  createCaller,          // Universal factory — call endpoints directly from any runtime
  createProxyCaller,     // Proxy factory — browser → server → backend
  createHandler,         // Web Standard adapter handler for server frameworks
  HTTPError,             // Typed HTTP error with status, headers, data
  isHTTPError,           // Type guard for HTTPError
  createLogger,          // Logger bound to a context — see Logging
  logger,                // Logger that takes the context per call
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

### `@noverax/courier/realtime` — Streams & Channels

```ts
import {
  subscribeSSE,          // Read a server-sent event stream, resuming from its last event id
  createMemoryPubSub,    // In-process broadcasts, for one server
  createMemoryStream,    // In-process event history a stream resumes from
  createMemoryPresence,  // In-process presence: who is on a topic
  RealtimeError,         // A stream's or a channel's error, with its code
  isRealtimeError,       // Type guard for RealtimeError
} from "@noverax/courier/realtime"
```

### `@noverax/courier/config` — Project Config

```ts
import { defineConfig } from "@noverax/courier/config" // Types a courier.config.ts: sources, Studio and server settings
```

### `@noverax/courier/fetch` — Standalone Fetch Client

```ts
import { createFetch } from "@noverax/courier/fetch" // A small wrapper over fetch: base URL, JSON, search params, timeout
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

// Imported as a type: the API definition — upstream URL, endpoint paths,
// middleware — stays on the server. An API with streams or channels passes a
// `boundary` from `defineBoundary` instead (see the proxy-mode docs).
const caller = createProxyCaller<typeof api>("api", { proxyPath: { http: "/api/request" } })

const users = await caller.users.getAll()
```

### 3. Add middleware

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [
    retryMiddleware({ limit: 3 }),
    authMiddleware({ getToken: () => localStorage.getItem("token") ?? "" }),
  ],
  groups: { users },
})
```

`retryMiddleware` retries a 5xx or a request that got no answer, and only on endpoints that read. A write whose answer was lost may already have been carried out, so it is sent once unless you pass `mutations: true` — do that only when the upstream recognises a repeated write, for example by an idempotency key. The same holds for a `retry` policy on a `courier()` base or an endpoint's `.retry()`.

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

## Security Defaults

- **`pathOptions` decides its own keys.** A path parameter `pathOptions` returns — a tenant read from the session cookie — cannot be replaced by a caller's variable of the same name, and a missing value refuses the call with a 400. To let the caller choose a path parameter, leave it out of `pathOptions` and declare it in the endpoint's variables.
- **A path parameter stays in its segment.** Its value is percent-encoded, and `.` or `..` — which the URL parser would resolve into a different route — refuse the call with a 400.

<br />

## Testing

```ts
import { createTestClient } from "@noverax/courier/testing"
import type { api } from "./api/sources"

const { client, mock, history, reset } = createTestClient<typeof api>()

const alice = { id: "1", name: "Alice", email: "alice@test.com" }

mock("users", "getAll").resolves([alice])

const users = await client.users.getAll()
expect(users).toHaveLength(1)
expect(history).toHaveLength(1)
expect(history[0].group).toBe("users")
expect(history[0].method).toBe("getAll")

// Mock lifecycle
mock("users", "getAll").resolves([alice]).once()         // consumed after 1 call
mock("users", "getAll").resolves([alice]).times(3)       // consumed after 3 calls
mock("users", "getAll").resolves([]).delay(100)          // artificial delay
mock("users", "getById").rejects(500, { message: "Error" })  // mock errors
```

<br />

## Logging

Courier logs through `createLogger`, which your own server code can use too:

```ts
import { createLogger } from "@noverax/courier"

const log = createLogger("Billing")

log.info("Invoice sent")
log.warn("Payment provider slow to answer", error) // the error prints with its stack and cause chain
```

On a server, `debug` and `info` go to **stdout** and `warn` and `error` to **stderr**, one line each, prefixed with `[Courier]`, the process id, the time, the level and the context. An error passed as the second argument is printed after the line the way the runtime's console prints errors — stack, `cause` chain, an AggregateError's errors, properties such as `code` — and the root of a chain too deep for the console to show is printed on its own.

| Variable | Values | Default |
|---|---|---|
| `COURIER_LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | `info` |
| `NO_COLOR` | any non-empty value turns colour off | colour on a terminal only |
| `FORCE_COLOR` | `1`, `2`, `3` or `true` turns colour on, also into a pipe | — |

`COURIER_LOG_LEVEL` is read on every line, so setting it in your entry module takes effect. A log file or a pipe gets plain text. In a browser the lines go to the devtools console, whose own level filter applies.

<br />

## Building Server Adapters

The `createHandler` function returns a Web Standard handler. All official adapters use it internally:

```ts
import { createHandler, registerSources } from "@noverax/courier"
import { sources } from "./api/sources"

registerSources(sources)

const handler = createHandler({ allowedOrigins: ["https://app.example.com"] })

// handler.handle(request)     — auto-routes GET/POST/SSE
// handler.handleGet(request)  — query endpoints only
// handler.handlePost(request) — mutations + data
// handler.handleSSE(request)  — streams
// handler.shutdownSSE()       — drains open streams before the host closes
```

Given `sources` — `createHandler({ sources })` — the handler answers for those alone. Without them it reads the process-wide registry that `registerSources()` and `attachRuntime()` fill, at request time, which is how the framework adapters work. `createWSHandler` takes `sources` the same way. Pass it nothing to accept the defaults.

For Node.js servers, use `toWebRequest` and `sendWebResponse` from `@noverax/courier/node` to bridge between Node.js and Web Standard APIs. An adapter announces what it hosts to Studio with `announceWhenRegistered` from `@noverax/courier/announce`, called on each request.

<br />

## Proxy Security

The handler serves browser pages on the application's own origin and refuses a request another site's page made, so no third-party page can call your API with your users' cookies. A browser's `Sec-Fetch-Site` decides where it is sent — an `<img>` or a link on another site is refused even though it carries no `Origin` — and otherwise the page's `Origin` must be the origin the request was addressed to. A caller that sends neither is not a browser page, and is served.

Pages on other origins are served when `allowedOrigins` lists them. An entry is an exact origin, `https://*.example.com` for the sub-domains of a host over one scheme and port, or `*.example.com` for them over any.

A DNS-rebinding page points its own name at the machine the app runs on, and its calls then look same-origin to the browser. Every entry point therefore answers only for the host names the app is reached by: a request for another host gets `421` with the code `HOST_NOT_ALLOWED`, and a socket is closed with `4421`. `localhost`, `*.localhost` names and IP addresses are always served; list the rest in `allowedHosts` — `createHandler({ allowedHosts: ["app.example.com", "*.preview.example.com"] })`, and the same option on `createWSHandler` and every adapter. Left out, development serves nothing else and production every name.

```ts
createHandler({ allowedOrigins: ["https://admin.example.com", "https://*.example.com"] })
```

The handler speaks CORS for those origins: it answers their preflight and gives every answer the permission a browser needs to read it. Route `OPTIONS` to the handler as well as `GET` and `POST`.

Every endpoint of a source is reachable through the proxy unless the source says otherwise. Name the ones a browser may call with `defineBoundary`, and give the boundary to the API as well as to the client, so the server refuses the rest. The boundary is typed against the API that holds it, so annotate it as `ProxyBoundary`:

```ts
// boundary.ts
export const boundary: ProxyBoundary = defineBoundary<typeof api>({
  source: "api",
  expose: { "users.getAll": "query" },
})

// api.ts
export const api = defineApi({ baseURL: "https://api.example.com", boundary, groups: { users } })
```

Cookies cross the proxy only where they are named: `cookie` in a source's `allowedHeaders`, a base's, or an endpoint's `.headers()` forwards the browser's cookies to the upstream, and `set-cookie` passes the upstream's back. Unnamed, neither crosses, so a source that points at a third party never receives your users' session and cannot set cookies on your origin. A backend-for-frontend sign-in names each where it travels:

```ts
const auth = defineGroup({
  prefix: "auth",
  endpoints: {
    login: endpoint.post("login").headers(["set-cookie"]), // the session reaches the browser
    me: endpoint.get("me").headers(["cookie"]), // and goes back to the upstream
  },
})
```

A client address is never copied from the caller, which can write any: the proxy sends the upstream an `X-Forwarded-For` it writes from the connection — the chain a reverse proxy on a loopback or private address wrote, with that proxy's address appended, or the caller's own public address. A runtime that does not report the caller's address (the Web-standard adapters) sends none. To forward the caller's copy as before, because a platform in front writes it, name it: `allowedHeaders: ["x-forwarded-for"]`.

A proxied call carries the server's credentials, so it follows an upstream redirect only while the redirect stays on the origin the call was sent to; a redirect to another origin reaches the caller as its status, unfollowed. Set `redirect: "follow"` on a source that trusts every redirect its upstream sends.

A streamed answer passes the upstream's body and content type through, from your application's origin, so it carries `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`: HTML an upstream sends cannot run as your application when its URL is opened as a page.

<br />

## License

[MIT](../../LICENSE)
