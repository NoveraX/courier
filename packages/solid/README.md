<div align="center">
  <br />

  # @noverax/courier-solid

  **Solid Start adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-solid"><img src="https://img.shields.io/npm/v/@noverax/courier-solid?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-solid @noverax/courier @solidjs/start
```

## Usage

```ts
// src/entry-server.tsx
import { registerSources } from "@noverax/courier"
import { sources } from "~/api"

registerSources(sources)
```

```ts
// src/routes/api/request.ts
import { courierHandler } from "@noverax/courier-solid"

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at server startup. The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request. The dev server builds the request without a signal that reports a client leaving, so the handler watches the Node response on the event's `nativeEvent` as well, in development and in production alike.

## API

### `courierHandler()`

Creates a Solid Start API route handler. Returns a function compatible with Solid Start's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
