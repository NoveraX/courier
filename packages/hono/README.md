<div align="center">
  <br />

  # @noverax/nexus-hono

  **Hono adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-hono"><img src="https://img.shields.io/npm/v/@noverax/nexus-hono?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-hono @noverax/nexus hono
```

## Usage

```ts
import { Hono } from "hono"
import { registerSources } from "@noverax/nexus"
import { nexusHandler } from "@noverax/nexus-hono"
import { sources } from "./api/sources"

registerSources(sources)

const app = new Hono()

app.all("/api/request", nexusHandler())

export default app
```

`nexusHandler()` is zero-arg — sources are read at request time from the core global registry. Works on any Hono runtime — Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge, AWS Lambda.

## Options

```ts
nexusHandler({
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
import { createProxyCaller } from "@noverax/nexus"
import { api } from "./api/sources"

const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](../../LICENSE)
