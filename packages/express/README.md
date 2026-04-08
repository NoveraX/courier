<div align="center">
  <br />

  # @noverax/nexus-express

  **Express adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-express"><img src="https://img.shields.io/npm/v/@noverax/nexus-express?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-express @noverax/nexus express
```

## Usage

```ts
import express from "express"
import { nexusHandler } from "@noverax/nexus-express"
import { sources } from "./api/sources"

const app = express()

app.all("/api/request", nexusHandler(sources))

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})
```

The handler accepts any HTTP method. GET requests are routed to query-type endpoints, POST requests handle mutations and data payloads.

## How It Works

1. Converts the Node.js `IncomingMessage` to a Web Standard `Request`
2. Passes it to the core `createHandler(sources).handle()`
3. Converts the Web `Response` back to Node.js `ServerResponse`

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

Or with React Query:

```ts
import { createProxyQueryCaller } from "@noverax/nexus-react"

const q = createProxyQueryCaller("api", { proxyPath: { http: "/api/request" } })
```

## License

[MIT](../../LICENSE)
