<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for NestJS</h1>

  <p><strong>Typed calls to any backend, served by your Nest application.</strong></p>

  <p>Apply one middleware and every endpoint your pages may call is proxied, on the Express and the Fastify platform alike — with the user's session in every guard, interceptor, controller and service.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-nestjs"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-nestjs?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/nestjs"><strong>NestJS guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/nestjs">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The NestJS integration applies Courier's proxy as Nest middleware on the route you choose, takes the body Nest already parsed — or the exact bytes, with `rawBody: true` — and carries the user's session through your providers.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One middleware</h4>
      <code>courierMiddleware()</code> on <code>/api/request</code>, applied in your module's <code>configure</code>.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      <code>requestContext()</code> gives every guard, interceptor, controller and service the session of the request it serves.
    </td>
    <td width="33%" valign="top">
      <h4>Both platforms</h4>
      Express and Fastify alike, mounted before every module's own middleware.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>WebSockets</h4>
      <code>courierWSAttach()</code> answers upgrades on one path and leaves the rest to your gateways.
    </td>
    <td valign="top">
      <h4>Exact bodies</h4>
      With <code>rawBody: true</code> the proxy forwards the bytes the client sent; uploads stream through unparsed.
    </td>
    <td valign="top">
      <h4>Graceful shutdown</h4>
      Streams drained from <code>beforeApplicationShutdown</code>, sockets closed with 1012 — clients reconnect on their own.
    </td>
  </tr>
</table>

<br />

## Quick start

In your NestJS project:

```bash
npx @noverax/create-courier
```

It adds a module on `/api/request`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework nestjs`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-nestjs @noverax/courier @nestjs/common
```

<br />

## Usage

Register as NestJS middleware:

```ts
import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common"
import { registerSources } from "@noverax/courier"
import { courierMiddleware } from "@noverax/courier-nestjs"
import { sources } from "./api/sources"

registerSources(sources)

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(courierMiddleware())
      .forRoutes("/api/request")
  }
}
```

`courierMiddleware()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at module load.

### Request bodies

`NestFactory.create` parses JSON bodies for the whole application before any middleware runs, so a proxied JSON call reaches the middleware already parsed. The middleware takes the body from Nest's parser — keep that parser on, since your own controllers' `@Body()` needs it. Create the app with `rawBody: true` and the proxy forwards the exact bytes the client sent; without it, the parsed JSON is serialized again, which gives the same value.

Nest's JSON parser accepts 100 KB by default, less than the proxy's own 1 MB `maxBodyBytes`, and answers a larger call with its own 413 before Courier sees it. Raise it to match:

```ts
// main.ts
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { AppModule } from "./app.module"

const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
app.useBodyParser("json", { limit: "1mb" })
await app.listen(3000)
```

Uploads (`multipart/form-data`) are not parsed by Nest and reach the proxy as a stream, up to its `maxUploadBytes` — 10 MB unless you pass another: `courierMiddleware({ maxUploadBytes: 50 * 1024 * 1024 })`.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a guard, an interceptor, a controller or a service makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else. Mount the middleware as the application is created:

```ts
// main.ts
import { NestFactory } from "@nestjs/core"
import { requestContext } from "@noverax/courier-nestjs"
import { AppModule } from "./app.module"

const app = await NestFactory.create(AppModule)
app.use(requestContext())
await app.listen(3000)
```

It runs before every module's own middleware, on the Express and the Fastify platform alike. The session cookies the API sets reach the browser on the response, beside the application's own.

<br />

## WebSockets

```ts
import { courierWSAttach } from "@noverax/courier-nestjs"

const app = await NestFactory.create(AppModule)
const detach = courierWSAttach(app.getHttpServer()) // answers upgrades on /api/ws
await app.listen(3000)
```

`courierWSAttach` answers WebSocket upgrades on one path — `/api/ws` unless you pass `path` — and leaves every other path to NestJS gateways and any other WebSocket handler. Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. A message larger than `maxMessageSize` (64 KB by default) is refused with a `4413` error and the connection stays open; a frame larger than 1 MiB, or twice `maxMessageSize` when that is larger, closes the connection with `1009` before it is buffered. Requires the `ws` package.

<br />

## Shutting down

`app.close()` waits for every open connection, and an SSE stream or a WebSocket stays open on its own — a stream until its lifetime cap, 30 minutes by default. Drain the streams before the server closes, from `beforeApplicationShutdown`:

```ts
import { type BeforeApplicationShutdown, type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { courierMiddleware } from "@noverax/courier-nestjs"

const proxy = courierMiddleware()

@Module({})
export class AppModule implements NestModule, BeforeApplicationShutdown {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(proxy).forRoutes("/api/request")
  }

  beforeApplicationShutdown() {
    return proxy.shutdownSSE()
  }
}
```

`shutdownSSE()` sends each stream's client a `courier:shutdown` notice that tells it when to reconnect, then ends the streams; `sseConnections` lists the open ones. `courierSSEMiddleware()` drains the same way. Call `detach()` from `courierWSAttach` before `app.close()`: it closes each WebSocket with 1012, which a Courier client answers by reconnecting later.

<br />

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler().handle()` (sources read lazily via the global registry)
3. Converts the Web `Response` back to Node.js `ServerResponse`
4. Errors are forwarded to NestJS error handling via `next(error)`

<br />

## With Frontend

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

// The routes Courier Studio writes from the endpoints you mark .expose():
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
