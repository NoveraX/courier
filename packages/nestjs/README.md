<div align="center">
  <br />

  # @noverax/nexus-nestjs

  **NestJS adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-nestjs"><img src="https://img.shields.io/npm/v/@noverax/nexus-nestjs?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-nestjs @noverax/nexus @nestjs/common
```

## Usage

Register as NestJS middleware:

```ts
import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common"
import { registerSources } from "@noverax/nexus"
import { nexusMiddleware } from "@noverax/nexus-nestjs"
import { sources } from "./api/sources"

registerSources(sources)

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(nexusMiddleware())
      .forRoutes("/api/request")
  }
}
```

`nexusMiddleware()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at module load.

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler().handle()` (sources read lazily via the global registry)
3. Converts the Web `Response` back to Node.js `ServerResponse`
4. Errors are forwarded to NestJS error handling via `next(error)`

## With Frontend

```ts
import { createProxyCaller } from "@noverax/nexus"
import { api } from "./api/sources"

const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](../../LICENSE)
