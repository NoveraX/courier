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
