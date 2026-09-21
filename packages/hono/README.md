<div align="center">
  <br />

  # @noverax/courier-hono

  **Hono adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-hono"><img src="https://img.shields.io/npm/v/@noverax/courier-hono?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-hono @noverax/courier hono
```

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

## Options

```ts
courierHandler({
  validateOrigin: (origin, request) => {
    // Custom origin validation (POST requests check origin by default)
    return origin === "https://myapp.com"
  },
})
```

## How It Works

Hono uses Web Standard `Request`/`Response` natively, so the adapter simply passes `c.req.raw` directly to the core handler — zero conversion overhead.

## With Frontend

```ts
import { createProxyCaller } from "@noverax/courier"
import { api } from "./api/sources"

const caller = createProxyCaller<typeof api>("api", { source: api, proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](../../LICENSE)
