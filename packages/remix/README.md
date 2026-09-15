<div align="center">
  <br />

  # @noverax/nexus-remix

  **Remix adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-remix"><img src="https://img.shields.io/npm/v/@noverax/nexus-remix?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-remix @noverax/nexus @remix-run/node
```

## Usage

```ts
// app/entry.server.tsx
import { registerSources } from "@noverax/nexus"
import { sources } from "~/api"

registerSources(sources)
```

```ts
// app/routes/api.request.ts
import { nexusHandler } from "@noverax/nexus-remix"

const handler = nexusHandler()
export const loader = handler
export const action = handler
```

`nexusHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at server startup. The handler uses Web Standard `Request`/`Response` natively — no conversion needed. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler()`

Creates a Remix resource route handler. Returns a function compatible with Remix's `loader`/`action` exports.

## License

[MIT](../../LICENSE)
