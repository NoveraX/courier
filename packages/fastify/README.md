<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Fastify</h1>

  <p><strong>Typed calls to any backend, through one Fastify plugin.</strong></p>

  <p>Register one plugin and every endpoint your pages may call is proxied — keys, paths and the user's session stay on your server. SSE, WebSockets and a graceful shutdown included.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-fastify"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-fastify?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/fastify"><strong>Fastify guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/fastify">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The Fastify plugin answers at one prefix and leaves every other path, and the app's 404s, to the app. It reads bodies itself — JSON and uploads alike — so Fastify's body parsing is turned off inside the plugin only.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One plugin</h4>
      <code>courierPlugin</code> answers every endpoint the boundary exposes at the prefix you register it on.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      One <code>onRequest</code> hook gives every call a route makes the session of the request it serves.
    </td>
    <td width="33%" valign="top">
      <h4>Streams and sockets</h4>
      The plugin's route serves SSE too; <code>courierWSHandler()</code> runs channels on <code>@fastify/websocket</code>.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Bounded</h4>
      JSON up to 1 MB and uploads up to 10 MB unless you raise them; <code>wsFrameLimit()</code> caps a frame before it is read.
    </td>
    <td valign="top">
      <h4>Graceful shutdown</h4>
      The plugin drains its streams when the app closes, telling each client when to reconnect.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Fastify project:

```bash
npx @noverax/create-courier
```

It adds a plugin on `/api/request`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework fastify`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-fastify @noverax/courier fastify
```

<br />

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

<br />

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prefix` | `string` | `"/api/request"` | The path the proxy answers at — the caller's `proxyPath.http` |
| `config` | `HandlerConfig` | — | Optional handler behavior options (origins, SSE headers, etc.) |

The proxy reads a JSON call up to `config.maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to `config.maxUploadBytes`, 10 MB. Fastify's own `bodyLimit` does not apply: the plugin reads bodies itself.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a route makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```ts
import { requestContext } from "@noverax/courier-fastify"

app.addHook("onRequest", requestContext())
```

The session cookies the API sets reach the browser on the reply, beside any the route sets. Add the hook on the root instance, so it runs for every route.

<br />

## Streaming

The plugin's route serves SSE streams as well as calls. A separate stream route:

```ts
import { courierSSEHandler } from "@noverax/courier-fastify"

const sse = courierSSEHandler()
app.get("/api/sse", sse)
app.addHook("preClose", () => sse.shutdownSSE())
```

<br />

## WebSockets

`courierWSHandler` runs on [`@fastify/websocket`](https://github.com/fastify/fastify-websocket), which must be registered before the route:

```bash
npm install @fastify/websocket
```

```ts
import fastifyWebsocket from "@fastify/websocket"
import { wsFrameLimit } from "@noverax/courier/node"
import { courierWSHandler } from "@noverax/courier-fastify"

await app.register(fastifyWebsocket, { options: { maxPayload: wsFrameLimit() } })
app.get("/api/ws", { websocket: true }, courierWSHandler())
```

Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. The plugin's `ws` server reads each frame whole before Courier sees it, up to its `maxPayload` — 100 MiB unless you set it. Set it to `wsFrameLimit(maxMessageSize)` — 1 MiB, or twice the handler's `maxMessageSize` (64 KB by default) when that is larger — as the Express and Nest adapters do: a message somewhat over `maxMessageSize` is then refused with close code 4413 for that message alone, the socket and its other subscriptions kept, and a frame larger still is refused with 1009 before it is read. Left at 100 MiB, the handler warns once at the first connection. Without the plugin, the route answers 500 with a `WEBSOCKET_PLUGIN_MISSING` error. The plugin closes its sockets itself when the app closes.

<br />

## Shutting down

`app.close()` waits for every open connection, and an SSE stream stays open until its lifetime cap, 30 minutes by default. The plugin drains its own streams when the app closes: each client gets a `courier:shutdown` notice telling it when to reconnect, and the streams end. A route made with `courierSSEHandler()` drains when you call its `shutdownSSE()`, from a `preClose` hook as above; `sseConnections` lists its open streams.

<br />

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
