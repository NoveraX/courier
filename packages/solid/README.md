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
// src/routes/api/request.ts
import { nexusHandler } from "@noverax/nexus-solid"
import { sources } from "~/api"

const handler = nexusHandler(sources)
export const GET = handler
export const POST = handler
```

The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler(sources)`

Creates a Solid Start API route handler. Takes a `Sources` object and returns a function compatible with Solid Start's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
