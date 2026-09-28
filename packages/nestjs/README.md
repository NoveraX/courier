<div align="center">
  <br />

  # @noverax/courier-nestjs

  **NestJS adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-nestjs"><img src="https://img.shields.io/npm/v/@noverax/courier-nestjs?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-nestjs @noverax/courier @nestjs/common
```

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

## WebSockets

```ts
import { courierWSAttach } from "@noverax/courier-nestjs"

const app = await NestFactory.create(AppModule)
const detach = courierWSAttach(app.getHttpServer()) // answers upgrades on /api/ws
await app.listen(3000)
```

`courierWSAttach` answers WebSocket upgrades on one path — `/api/ws` unless you pass `path` — and leaves every other path to NestJS gateways and any other WebSocket handler. Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. Frames larger than `maxMessageSize` (64 KB by default) are refused before they are buffered. Requires the `ws` package.

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

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler().handle()` (sources read lazily via the global registry)
3. Converts the Web `Response` back to Node.js `ServerResponse`
4. Errors are forwarded to NestJS error handling via `next(error)`

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
