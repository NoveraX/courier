<div align="center">
  <br />

  # @noverax/courier-express

  **Express adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-express"><img src="https://img.shields.io/npm/v/@noverax/courier-express?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-express @noverax/courier express
```

## Usage

```ts
import express from "express"
import { registerSources } from "@noverax/courier"
import { courierHandler } from "@noverax/courier-express"
import { sources } from "./api/sources"

registerSources(sources)

const app = express()

app.all("/api/request", courierHandler())

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` (or by `attachRuntime()` auto-loading `courier.config.ts` in Studio-instrumented projects). The handler accepts any HTTP method. GET requests are routed to query-type endpoints, POST requests handle mutations and data payloads.

## Streaming and WebSockets

```ts
import http from "node:http"
import { courierSSEHandler, courierWSAttach } from "@noverax/courier-express"

app.get("/api/sse", courierSSEHandler())

const server = http.createServer(app)
const detach = courierWSAttach(server) // answers upgrades on /api/ws
server.listen(3000)
```

`courierWSAttach` answers WebSocket upgrades on one path — `/api/ws` unless you pass `path` — and leaves every other path to the application's own WebSocket handlers. Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. Frames larger than `maxMessageSize` (64 KB by default) are refused before they are buffered. Requires the `ws` package.

## Shutting down

`server.close()` waits for every open connection, and an SSE stream or a WebSocket stays open on its own — a stream until its lifetime cap, 30 minutes by default. Drain them first:

```ts
const proxy = courierHandler()
const sse = courierSSEHandler()
app.all("/api/request", proxy)
app.get("/api/sse", sse)

process.on("SIGTERM", async () => {
  await Promise.all([proxy.shutdownSSE(), sse.shutdownSSE(), detach()])
  server.close()
})
```

`shutdownSSE()` sends each stream's client a `shutdown` event that tells it when to reconnect, then ends the streams; `sseConnections` lists the open ones. `detach()` closes each WebSocket with 1012, which a Courier client answers by reconnecting later. The proxy route serves streams too, which is why it drains as well.

## Limits

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to `maxUploadBytes`, 10 MB. Pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`. Do not mount a body parser (`express.json()`, `multer`) on the proxy route: the handler reads the raw body itself.

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler().handle()`
3. Converts the Web `Response` back to Node.js `ServerResponse`

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "./api"

// The first argument is the key this source has in your `sources` map —
// it is what the proxy addresses, and it travels as `?_s=<name>`.
const caller = createProxyCaller<typeof api>("api", {
  proxyPath: { http: "/api/request" },
})
const users = await caller.users.getAll()
```

Or with React Query:

```ts
import { createProxyQueryCaller } from "@noverax/courier-react"

const q = createProxyQueryCaller("api", { proxyPath: { http: "/api/request" } })
```

## License

[MIT](../../LICENSE)
