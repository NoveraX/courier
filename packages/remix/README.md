<div align="center">
  <br />

  # @noverax/courier-remix

  **Remix adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-remix"><img src="https://img.shields.io/npm/v/@noverax/courier-remix?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-remix @noverax/courier @remix-run/node
```

## Usage

```ts
// app/entry.server.tsx
import { registerSources } from "@noverax/courier"
import { sources } from "~/api"

registerSources(sources)
```

```ts
// app/routes/api.request.ts
import { courierHandler } from "@noverax/courier-remix"

const handler = courierHandler()
export const loader = handler
export const action = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at server startup. The handler uses Web Standard `Request`/`Response` natively — no conversion needed. GET requests are routed to query-type endpoints, POST requests handle mutations.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `courierHandler()`

Creates a Remix resource route handler. Returns a function compatible with Remix's `loader`/`action` exports.

## License

[MIT](../../LICENSE)
