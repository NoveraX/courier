<div align="center">
  <br />

  # @noverax/nexus-sveltekit

  **SvelteKit adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-sveltekit"><img src="https://img.shields.io/npm/v/@noverax/nexus-sveltekit?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-sveltekit @noverax/nexus @sveltejs/kit
```

## Usage

```ts
// src/routes/api/request/+server.ts
import { nexusHandler } from "@noverax/nexus-sveltekit"
import { sources } from "$lib/api"

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

Creates a SvelteKit request handler. Takes a `Sources` object and returns a function compatible with SvelteKit's `GET`/`POST` server exports.

## License

[MIT](../../LICENSE)
