<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-hono</h1>

  <p><strong>Hono adapter for Courier.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-hono"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-hono?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/hono">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-hono @noverax/courier hono
```

## Usage

```ts
import { Hono } from "hono"
import { registerSources } from "@noverax/courier"
import { courierHandler } from "@noverax/courier-hono"
import { sources } from "./api/sources"

registerSources(sources)

const app = new Hono()

app.all("/api/request", courierHandler())

export default app
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry. Works on any Hono runtime — Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge, AWS Lambda.

## Options

```ts
courierHandler({
  // Pages on other origins that may call the proxy. Same-origin pages and
  // non-browser callers are always accepted; `*.example.com` covers
  // sub-domains.
  allowedOrigins: ["https://admin.example.com"],
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `allowedOrigins` | `string[]` | — | Extra origins whose pages may call the proxy |
| `allowedHosts` | `string[]` | — | Host names the app is reached by; a request for another gets 421. `localhost`, `*.localhost` and IP addresses are always served; unset, production serves every name and development nothing else |
| `maxBodyBytes` | `number` | 1 MiB | Largest JSON or form body accepted |
| `maxUploadBytes` | `number` | 10 MiB | Largest multipart upload accepted |
| `sseHeaders` | `Record<string, string>` | — | Extra headers on SSE responses (CORS, for instance) |
| `sseMaxLifetimeMs` | `number` | 30 min | How long one SSE connection may live before the client reconnects and resumes |

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a route makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```ts
import { requestContext } from "@noverax/courier-hono/request-context"

app.use(requestContext())
```

The session cookies the API sets reach the browser on the response, beside the route's own. It needs `AsyncLocalStorage`: Node, Bun, Deno, or Cloudflare Workers with `nodejs_compat`.

## Streaming and WebSockets

`courierSSEHandler()` serves SSE streams, and `courierWSHandler()` serves WebSocket channels through your runtime's `upgradeWebSocket`. On Node.js with `@hono/node-server` and `ws`:

```ts
import { serve, upgradeWebSocket } from "@hono/node-server"
import { WebSocketServer } from "ws"
import { wsFrameLimit } from "@noverax/courier/node"
import { courierSSEHandler, courierWSHandler } from "@noverax/courier-hono"

app.get("/api/sse", courierSSEHandler())

const ws = courierWSHandler()
app.get("/api/ws", upgradeWebSocket((c) => ws(c)))

const wss = new WebSocketServer({ noServer: true, maxPayload: wsFrameLimit() })
serve({ fetch: app.fetch, port: 3000, websocket: { server: wss } })
```

Point the client at the same paths with `proxyPath: { sse: "/api/sse", ws: "/api/ws" }`.

Each caller may hold up to `maxConnectionsPerIP` WebSockets (50 by default). The caller is the connection's remote address, which the adapter reads from the runtime — `@hono/node-server`, Bun and Deno report it — and, when that address is a local or private one such as a reverse proxy's, the proxy's `X-Forwarded-For`. On a runtime that reports none, such as Cloudflare Workers, the proxy headers name the caller. If your proxy chain is deeper, name the caller yourself with `clientIp: (request) => …`.

The runtime's WebSocket server reads each frame before Courier sees it, so bound it with `wsFrameLimit(maxMessageSize)` from `@noverax/courier/node`, as `maxPayload` does above: a message somewhat over the handler's `maxMessageSize` (64 KB by default) is refused with 4413 for that message alone, and a frame larger still with 1009 before it is read.

## How It Works

Hono uses Web Standard `Request`/`Response` natively, so the adapter simply passes `c.req.raw` directly to the core handler — zero conversion overhead.

## With Frontend

```ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "./api/sources"

// Imported as a type: the API definition — upstream URL, endpoint paths,
// middleware — stays on the server. An API with streams or channels passes a
// `boundary` from `defineBoundary` instead (see the proxy-mode docs).
const caller = createProxyCaller<typeof api>("api", { proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
