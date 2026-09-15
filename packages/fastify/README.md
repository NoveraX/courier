<div align="center">
  <br />

  # @noverax/nexus-fastify

  **Fastify adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-fastify"><img src="https://img.shields.io/npm/v/@noverax/nexus-fastify?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-fastify @noverax/nexus fastify
```

## Usage

```ts
import Fastify from "fastify"
import { registerSources } from "@noverax/nexus"
import { nexusPlugin } from "@noverax/nexus-fastify"
import { sources } from "./api/sources"

registerSources(sources)

const app = Fastify()

app.register(nexusPlugin, {
  prefix: "/api/request",  // optional, defaults to "/"
})

app.listen({ port: 3000 })
```

The plugin is zero-sources — sources are read at request time from the core global registry populated by `registerSources()` (or by `attachRuntime()` auto-loading `nexus.config.ts`). It registers a wildcard route under the given prefix and automatically disables Fastify's body parsing so Nexus can handle multipart/json payloads directly.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prefix` | `string` | `"/"` | Route prefix for the handler |
| `config` | `HandlerConfig` | — | Optional handler behavior options (origins, SSE headers, etc.) |

## With Frontend

```ts
import { createProxyCaller } from "@noverax/nexus"
import { api } from "./api/sources"

const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## License

[MIT](../../LICENSE)
