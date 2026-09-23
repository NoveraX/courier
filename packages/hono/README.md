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
  // Pages on other origins that may call the proxy. Same-origin pages and
  // non-browser callers are always accepted; `*.example.com` covers
  // sub-domains.
  allowedOrigins: ["https://admin.example.com"],
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `allowedOrigins` | `string[]` | — | Extra origins whose pages may call the proxy |
| `maxBodyBytes` | `number` | 1 MiB | Largest JSON or form body accepted |
| `maxUploadBytes` | `number` | 10 MiB | Largest multipart upload accepted |
| `sseHeaders` | `Record<string, string>` | — | Extra headers on SSE responses (CORS, for instance) |
| `sseMaxLifetimeMs` | `number` | 30 min | How long one SSE connection may live before the client reconnects and resumes |

## How It Works

Hono uses Web Standard `Request`/`Response` natively, so the adapter simply passes `c.req.raw` directly to the core handler — zero conversion overhead.

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
