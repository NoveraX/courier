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
import { nexusMiddleware } from "@noverax/nexus-nestjs"
import { sources } from "./api/sources"

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(nexusMiddleware(sources))
      .forRoutes("/api/request")
  }
}
```

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler(sources).handle()`
3. Converts the Web `Response` back to Node.js `ServerResponse`
4. Errors are forwarded to NestJS error handling via `next(error)`

## With Frontend

```ts
import { createProxyCaller } from "@noverax/nexus"

const call = createProxyCaller({ proxyUrl: "/api/request" })
const users = await call("api")("users:getAll")
```

## License

[MIT](../../LICENSE)
