<div align="center">
  <br />

  # @noverax/courier-fastify

  **Fastify adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-fastify"><img src="https://img.shields.io/npm/v/@noverax/courier-fastify?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-fastify @noverax/courier fastify
```

## Usage

```ts
import Fastify from "fastify"
import { registerSources } from "@noverax/courier"
import { courierPlugin } from "@noverax/courier-fastify"
import { sources } from "./api/sources"

registerSources(sources)

const app = Fastify()

app.register(courierPlugin, {
  prefix: "/api/request",  // optional, defaults to "/api/request"
})

app.listen({ port: 3000 })
```

The plugin is zero-sources — sources are read at request time from the core global registry populated by `registerSources()` (or by `attachRuntime()` auto-loading `courier.config.ts`). It answers at the prefix alone — the caller's `proxyPath.http` — and leaves every other path, and the app's 404s, to the app. It disables Fastify's body parsing inside the plugin only, so Courier can handle multipart/json payloads directly.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prefix` | `string` | `"/api/request"` | The path the proxy answers at — the caller's `proxyPath.http` |
| `config` | `HandlerConfig` | — | Optional handler behavior options (origins, SSE headers, etc.) |

The proxy reads a JSON call up to `config.maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to `config.maxUploadBytes`, 10 MB. Fastify's own `bodyLimit` does not apply: the plugin reads bodies itself.

## Streaming

The plugin's route serves SSE streams as well as calls. A separate stream route:

```ts
import { courierSSEHandler } from "@noverax/courier-fastify"

const sse = courierSSEHandler()
app.get("/api/sse", sse)
app.addHook("preClose", () => sse.shutdownSSE())
```

## WebSockets

`courierWSHandler` runs on [`@fastify/websocket`](https://github.com/fastify/fastify-websocket), which must be registered before the route:

```bash
npm install @fastify/websocket
```

```ts
import fastifyWebsocket from "@fastify/websocket"
import { courierWSHandler } from "@noverax/courier-fastify"

await app.register(fastifyWebsocket, { options: { maxPayload: 65_536 } })
app.get("/api/ws", { websocket: true }, courierWSHandler())
```

Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. The plugin's `ws` server reads each frame whole before Courier sees it, up to its `maxPayload` — 100 MiB unless you set it. Set it no larger than the handler's `maxMessageSize` (64 KB by default), and a larger frame is refused with close code 1009 before it is read; left larger, Courier answers such a frame with an error only after reading it, and warns once at the first connection. Without the plugin, the route answers 500 with a `WEBSOCKET_PLUGIN_MISSING` error. The plugin closes its sockets itself when the app closes.

## Shutting down

`app.close()` waits for every open connection, and an SSE stream stays open until its lifetime cap, 30 minutes by default. The plugin drains its own streams when the app closes: each client gets a `shutdown` event telling it when to reconnect, and the streams end. A route made with `courierSSEHandler()` drains when you call its `shutdownSSE()`, from a `preClose` hook as above; `sseConnections` lists its open streams.

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

[MIT](../../LICENSE)
