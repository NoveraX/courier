<div align="center">
  <br />

  # @noverax/nexus-solid

  **Solid Start adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-solid"><img src="https://img.shields.io/npm/v/@noverax/nexus-solid?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-solid @noverax/nexus @solidjs/start
```

## Usage

```ts
// src/entry-server.tsx
import { registerSources } from "@noverax/nexus"
import { sources } from "~/api"

registerSources(sources)
```

```ts
// src/routes/api/request.ts
import { nexusHandler } from "@noverax/nexus-solid"

const handler = nexusHandler()
export const GET = handler
export const POST = handler
```

`nexusHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at server startup. The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler()`

Creates a Solid Start API route handler. Returns a function compatible with Solid Start's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
