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
// app/routes/api.request.ts
import { nexusHandler } from "@noverax/nexus-remix"
import { sources } from "~/api"

const handler = nexusHandler(sources)
export const loader = handler
export const action = handler
```

The handler uses Web Standard `Request`/`Response` natively — no conversion needed. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler(sources)`

Creates a Remix resource route handler. Takes a `Sources` object and returns a function compatible with Remix's `loader`/`action` exports.

## License

[MIT](../../LICENSE)
