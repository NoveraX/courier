<div align="center">
  <br />

  # @noverax/courier-sveltekit

  **SvelteKit adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-sveltekit"><img src="https://img.shields.io/npm/v/@noverax/courier-sveltekit?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-sveltekit @noverax/courier @sveltejs/kit
```

## Usage

```ts
// src/hooks.server.ts
import { registerSources } from "@noverax/courier"
import { sources } from "$lib/api"

registerSources(sources)
```

```ts
// src/routes/api/request/+server.ts
import { courierHandler } from "@noverax/courier-sveltekit"

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` in `hooks.server.ts`. The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "./api"

// The first argument is the key this source has in your `sources` map —
// it is what the proxy addresses, and it travels as `?_s=<name>`.
const caller = createProxyCaller<typeof api>("api", {
  proxyPath: { http: "/api/request" },
})
const users = await caller.users.getAll()
```

## Cancelled calls

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request. SvelteKit's request signal does not report a client that leaves after its body has arrived, so under `@sveltejs/adapter-node` the handler watches the client's socket, from `platform.req`, instead. The Vite dev server exposes no connection: during `vite dev` a cancelled call still runs to completion upstream.

## API

### `courierHandler()`

Creates a SvelteKit request handler. Returns a function compatible with SvelteKit's `GET`/`POST` server exports.

## License

[MIT](../../LICENSE)
