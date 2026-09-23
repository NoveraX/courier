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

## WebSockets

```ts
import { courierWSAttach } from "@noverax/courier-nestjs"

const app = await NestFactory.create(AppModule)
const detach = courierWSAttach(app.getHttpServer()) // answers upgrades on /api/ws
await app.listen(3000)
```

`courierWSAttach` answers WebSocket upgrades on one path — `/api/ws` unless you pass `path` — and leaves every other path to NestJS gateways and any other WebSocket handler. Point the client at the same path with `proxyPath: { ws: "/api/ws" }`. Frames larger than `maxMessageSize` (64 KB by default) are refused before they are buffered. Requires the `ws` package.

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
