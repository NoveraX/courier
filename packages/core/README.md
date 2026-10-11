<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="48" />
    </picture>
  </a>

  <h1>Courier</h1>

  <p><strong>Type-safe HTTP for any backend.</strong></p>

  <p>Define your API once in plain TypeScript and call it from server code, from the browser through a proxy that keeps keys and sessions on the server, and over SSE and WebSockets — typed end to end, validated at runtime. Zero runtime dependencies, on the platform's own <code>fetch</code>.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/quick-start"><strong>Quick start</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/reference">API reference</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/core">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/hero-dark.png" />
    <img alt="An editor completing caller.users. with every endpoint the API defines, each typed from the definition" src="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/hero-light.png" width="880" />
  </picture>
</div>

<br />

## Why Courier

Most HTTP clients stop at “send a request, get a response”, and leave the types, the validation, the retries and the route the browser goes through to you. Courier starts from the definition: you describe each endpoint once, and every call made from it — on the server, in the page, over a stream — is typed by name, variables and answer, and checked at runtime. It works with **any backend that speaks HTTP** — FastAPI, Rails, Go, Laravel, a service you do not own — and asks nothing of it.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One definition</h4>
      Endpoints, groups and APIs in plain TypeScript. No codegen, no schema files — the types are inferred.
    </td>
    <td width="33%" valign="top">
      <h4>Every runtime</h4>
      Node.js, Bun, Deno, browsers, Cloudflare Workers and React Native: anywhere with <code>fetch</code>.
    </td>
    <td width="33%" valign="top">
      <h4>A proxy built in</h4>
      One route on your server runs the calls a browser may make — those your boundary names — with the user's session and CSRF token.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Runtime validation</h4>
      Zod, Valibot, ArkType or any Standard Schema, on the variables you send and the answers you get.
    </td>
    <td valign="top">
      <h4>Middleware</h4>
      Retry, auth with token refresh, caching, rate limits and logging, composed in order — or your own.
    </td>
    <td valign="top">
      <h4>Realtime and webhooks</h4>
      SSE streams and WebSocket channels typed both ways; incoming webhooks with their signatures checked.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier
```

Or set up the API layer, its proxy route, Studio and a mock in your project with one command — Next.js, Nuxt, SvelteKit, Astro, React Router, SolidStart, Vite, Expo, Express, Hono, Fastify or NestJS:

```bash
npx @noverax/create-courier
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

## Proxy Security

The handler serves browser pages on the application's own origin and refuses a request another site's page made, so no third-party page can call your API with your users' cookies. A browser's `Sec-Fetch-Site` decides where it is sent — an `<img>` or a link on another site is refused even though it carries no `Origin` — and otherwise the page's `Origin` must be the origin the request was addressed to. A caller that sends neither is not a browser page, and is served.

Pages on other origins are served when `allowedOrigins` lists them. An entry is an exact origin, `https://*.example.com` for the sub-domains of a host over one scheme and port, or `*.example.com` for them over any.

A DNS-rebinding page points its own name at the machine the app runs on, and its calls then look same-origin to the browser. Every entry point therefore answers only for the host names the app is reached by: a request for another host gets `421` with the code `HOST_NOT_ALLOWED`, and a socket is closed with `4421`. `localhost`, `*.localhost` names and IP addresses are always served; list the rest in `allowedHosts` — `createHandler({ allowedHosts: ["app.example.com", "*.preview.example.com"] })`, and the same option on `createWSHandler` and every adapter. Left out, development serves nothing else and production every name.

```ts
createHandler({ allowedOrigins: ["https://admin.example.com", "https://*.example.com"] })
```

The handler speaks CORS for those origins: it answers their preflight and gives every answer the permission a browser needs to read it. Route `OPTIONS` to the handler as well as `GET` and `POST`.

Every endpoint of a source is reachable through the proxy unless the source says otherwise. Name the ones a browser may call with `defineBoundary`, and give the boundary to the API as well as to the client, so the server refuses the rest. The API checks the boundary — a path it does not declare, or a wrong shape, does not compile — and a proxy client typed from the API reaches only the endpoints it names:

```ts
// boundary.ts
export const boundary = defineBoundary({
  source: "api",
  expose: { "users.getAll": "query" },
})

// api.ts
export const api = defineApi({ baseURL: "https://api.example.com", boundary, groups: { users } })
```

An API that keeps the user's session describes it, and the proxy — like a server rendering a page for the user — sends it the cookies the session is kept in and nothing else of the browser's, repeats its double-submit token on writes, refuses a write another site set off, and hands the browser the session cookies the API sets, made for your application's origin:

```ts
export const api = defineApi({
  baseURL: "https://api.example.com",
  session: { cookies: ["sessionid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  groups: { users },
})
```

For an API that keeps none, cookies cross the proxy only where they are named: `cookie` in a source's `allowedHeaders`, a base's, or an endpoint's `.headers()` forwards the browser's cookies to the upstream, and `set-cookie` passes the upstream's back. Unnamed, neither crosses, so a source that points at a third party never receives your users' session and cannot set cookies on your origin. A backend-for-frontend sign-in names each where it travels:

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

## Security Defaults

- **`pathOptions` decides its own keys.** A path parameter `pathOptions` returns — a tenant read from the session cookie — cannot be replaced by a caller's variable of the same name, and a missing value refuses the call with a 400. To let the caller choose a path parameter, leave it out of `pathOptions` and declare it in the endpoint's variables.
- **A path parameter stays in its segment.** Its value is percent-encoded, and `.` or `..` — which the URL parser would resolve into a different route — refuse the call with a 400.

<br />

## Logging

Courier logs through `createLogger`, which your own server code can use too:

```ts
import { createLogger } from "@noverax/courier"

const log = createLogger("Billing")

log.info("Invoice sent")
log.warn("Payment provider slow to answer", error) // the error prints with its stack and cause chain
```

On a server, `debug` and `info` go to **stdout** and `warn` and `error` to **stderr**, one line each: the time, the level, and `courier:` with the context in kebab case — `createLogger("Billing")` logs as `courier:billing` — then the message, the messages of every scope starting in one column. An error passed as the second argument is printed under the line the way the runtime's console prints errors — stack, `cause` chain, an AggregateError's errors, properties such as `code` — and the root of a chain too deep for the console to show is printed on its own.

```text
16:03:59 ● courier:billing        Invoice sent
16:04:02 ▲ courier:billing        Payment provider slow to answer
```

On a terminal the level is a symbol in its colour — `●` info, `▲` warn, `✕` error, `·` debug, with the debug line dimmed — and a request line such as `GET /users → 404 (3ms)` has its status coloured by class. Warnings, errors and statuses use the terminal's own sixteen colours, so they follow its theme, light or dark; only the info symbol is in Courier's blue, and the message keeps the terminal's foreground. A log file or a pipe gets plain text with the level as a word — `16:04:02 WARN  courier:billing …` — and `COURIER_LOG_FORMAT=json` writes one JSON object per line for a log pipeline:

```json
{"time":"2026-10-04T13:04:02.120Z","level":"warn","scope":"billing","pid":4120,"message":"Payment provider slow to answer","error":{"name":"TypeError","message":"fetch failed","stack":"…","cause":{"name":"Error","message":"connect ECONNREFUSED 10.0.0.7:443","code":"ECONNREFUSED"}}}
```

| Variable | Values | Default |
|---|---|---|
| `COURIER_LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | `info` |
| `COURIER_LOG_FORMAT` | `text`, or `json` for one JSON object per line | `text` |
| `NO_COLOR` | any non-empty value turns colour off | colour on a terminal only |
| `FORCE_COLOR` | `1`, `2`, `3` or `true` turns colour on, also into a pipe | — |

`COURIER_LOG_LEVEL` and `COURIER_LOG_FORMAT` are read on every line, so setting them in your entry module takes effect. In a browser the lines go to the devtools console, whose own level filter applies.

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

## Exports

The package's entry points, each loaded only where it is imported:

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
  smoothProgress,        // A progress callback that moves a bar smoothly between a transfer's events
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

### `@noverax/courier/openapi` — OpenAPI Export

```ts
import { toOpenAPI } from "@noverax/courier/openapi" // An API's definition as an OpenAPI 3.1 or 3.2 document
```

### `@noverax/courier/webhooks` — Incoming Webhooks

```ts
import {
  defineWebhook,             // A webhook's body schema and its sender's signature, checked before your handler
  stripeSignature,           // Stripe-Signature: HMAC-SHA-256 of <timestamp>.<body>
  githubSignature,           // X-Hub-Signature-256
  standardWebhookSignature,  // Standard Webhooks: Svix, Clerk, Resend
  hmacSignature,             // One header with an HMAC-SHA-256 of the body, for a service of your own
} from "@noverax/courier/webhooks"
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

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/react"><strong>@noverax/courier-react</strong></a><br />
      React Query hooks typed from the same definition.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
    </td>
    <td valign="top">
      <a href="https://github.com/NoveraX/courier#frameworks"><strong>Framework adapters</strong></a><br />
      Next.js, Nuxt, SvelteKit, Astro, React Router, SolidStart, Express, Hono, Fastify, NestJS.
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
