<div align="center">
  <br />

  # @noverax/courier-fastify

  **Fastify adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-fastify"><img src="https://img.shields.io/npm/v/@noverax/courier-fastify?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-fastify @noverax/courier fastify
```

## Usage

```ts
import Fastify from "fastify"
import { registerSources } from "@noverax/courier"
import { courierPlugin } from "@noverax/courier-fastify"
import { sources } from "./api/sources"

registerSources(sources)

const app = Fastify()

app.register(courierPlugin, {
  prefix: "/api/request",  // optional, defaults to "/api/request"
})

app.listen({ port: 3000 })
```

The plugin is zero-sources — sources are read at request time from the core global registry populated by `registerSources()` (or by `attachRuntime()` auto-loading `courier.config.ts`). It answers at the prefix alone — the caller's `proxyPath.http` — and leaves every other path, and the app's 404s, to the app. It disables Fastify's body parsing inside the plugin only, so Courier can handle multipart/json payloads directly.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prefix` | `string` | `"/api/request"` | The path the proxy answers at — the caller's `proxyPath.http` |
| `config` | `HandlerConfig` | — | Optional handler behavior options (origins, SSE headers, etc.) |

## With Frontend

```ts
import { createProxyCaller } from "@noverax/courier"
import { api } from "./api/sources"

const caller = createProxyCaller<typeof api>("api", { source: api, proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](../../LICENSE)
