<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Express</h1>

  <p><strong>Typed calls to any backend, through one Express route.</strong></p>

  <p>Mount one handler and every endpoint your pages may call is proxied — keys, paths and the user's session stay on your server. SSE, WebSockets and a graceful shutdown included.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-express"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-express?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/express"><strong>Express guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/express">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The Express adapter runs Courier's proxy as Express middleware: it turns the Node.js request into a Web `Request`, runs the core handler, and writes the `Response` back — streamed bodies, uploads and cancelled calls included.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One route</h4>
      <code>courierHandler()</code> answers every endpoint marked <code>.expose()</code>: <code>GET</code> for a read that may be cached, <code>POST</code> for every other call.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      <code>requestContext()</code> gives every call a route makes the session of the request it serves, through every <code>await</code>.
    </td>
    <td width="33%" valign="top">
      <h4>Streams and sockets</h4>
      <code>courierSSEHandler()</code> for SSE; <code>courierWSAttach()</code> answers WebSocket upgrades on one path and leaves the rest to you.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Bounded</h4>
      JSON up to 1 MB and uploads up to 10 MB unless you raise them; an oversized WebSocket frame is refused before it is buffered.
    </td>
    <td valign="top">
      <h4>Graceful shutdown</h4>
      Each stream is told when to reconnect and each socket closed with 1012, so clients come back on their own.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Express project:

```bash
npx @noverax/create-courier
```

It adds a router on `/api/request`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework express`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-express @noverax/courier express
```

<br />

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

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a route makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```ts
import { requestContext } from "@noverax/courier-express"

app.use(requestContext())
```

The session cookies the API sets reach the browser on the response.

<br />

## Streaming and WebSockets

```ts
import http from "node:http"
import { courierSSEHandler, courierWSAttach } from "@noverax/courier-express"

app.get("/api/sse", courierSSEHandler())

const server = http.createServer(app)
const detach = courierWSAttach(server) // answers upgrades on /api/ws
server.listen(3000)
```

`courierWSAttach` answers WebSocket upgrades on one path — `/api/ws` unless you pass `path` — and leaves every other path to the application's own WebSocket handlers. Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. A message larger than `maxMessageSize` (64 KB by default) is refused with a `4413` error and the connection stays open; a frame larger than 1 MiB, or twice `maxMessageSize` when that is larger, closes the connection with `1009` before it is buffered. Requires the `ws` package.

<br />

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

`shutdownSSE()` sends each stream's client a `courier:shutdown` notice that tells it when to reconnect, then ends the streams; `sseConnections` lists the open ones. `detach()` closes each WebSocket with 1012, which a Courier client answers by reconnecting later. The proxy route serves streams too, which is why it drains as well.

<br />

## Limits

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to `maxUploadBytes`, 10 MB. Pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`. Do not mount a body parser (`express.json()`, `multer`) on the proxy route: the handler reads the raw body itself.

<br />

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler().handle()`
3. Converts the Web `Response` back to Node.js `ServerResponse`

<br />

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

// The routes Courier Studio writes from the endpoints you mark .expose():
// what a page may call, under the key the source has in your `sources` map.
const caller = createProxyCaller(apiRoutes, {
  proxyPath: { http: "/api/request" },
})
const users = await caller.users.getAll()
```

Or with React Query:

```ts
import { createProxyQueryCaller } from "@noverax/courier-react"
import { apiRoutes } from "./courier.routes"

const q = createProxyQueryCaller(apiRoutes, { proxyPath: { http: "/api/request" } })
```

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
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
