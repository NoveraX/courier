<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Hono</h1>

  <p><strong>Typed calls to any backend, on every runtime Hono runs on.</strong></p>

  <p>Hono speaks Web Standards, so Courier's proxy runs on it with no conversion at all — on Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge and AWS Lambda.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-hono"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-hono?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/hono"><strong>Hono guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/hono">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Hono hands the adapter the Web `Request` as it is, and the core handler answers with a Web `Response`: the same proxy, with no conversion, everywhere Hono runs.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Every runtime</h4>
      Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge and AWS Lambda — one handler for all of them.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      <code>requestContext()</code> carries the session through every <code>await</code>, wherever <code>AsyncLocalStorage</code> runs.
    </td>
    <td width="33%" valign="top">
      <h4>Streams and sockets</h4>
      <code>courierSSEHandler()</code> for SSE and <code>courierWSHandler()</code> through your runtime's own <code>upgradeWebSocket</code>.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Fair limits</h4>
      WebSockets per caller, counted by the runtime's address or a trusted proxy's <code>X-Forwarded-For</code>.
    </td>
    <td valign="top">
      <h4>Bounded frames</h4>
      <code>wsFrameLimit()</code> caps a frame before Courier reads it; an oversized message is refused on its own.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Hono project:

```bash
npx @noverax/create-courier
```

It adds the routes on `/api/request`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework hono`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-hono @noverax/courier hono
```

<br />

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

<br />

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

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a route makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```ts
import { requestContext } from "@noverax/courier-hono/request-context"

app.use(requestContext())
```

The session cookies the API sets reach the browser on the response, beside the route's own. It needs `AsyncLocalStorage`: Node, Bun, Deno, or Cloudflare Workers with `nodejs_compat`.

<br />

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

<br />

## How It Works

Hono uses Web Standard `Request`/`Response` natively, so the adapter simply passes `c.req.raw` directly to the core handler — zero conversion overhead.

<br />

## With Frontend

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

// The routes Courier writes from the endpoints you mark .expose():
// what a page may call, and how. The API definition — upstream URL, endpoint
// paths, middleware — stays on the server.
const caller = createProxyCaller(apiRoutes, { proxyPath: { http: "/api/request" } })
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
