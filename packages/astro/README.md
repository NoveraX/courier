<div align="center">
  <br />

  # @noverax/courier-astro

  **Astro adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-astro"><img src="https://img.shields.io/npm/v/@noverax/courier-astro?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-astro @noverax/courier astro
```

## Usage

```ts
// src/middleware.ts
import { registerSources } from "@noverax/courier"
import { sources } from "./api"

registerSources(sources)
```

```ts
// src/pages/api/request.ts
import { courierHandler } from "@noverax/courier-astro"

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at module load. Works with both static and SSR output modes.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `courierHandler()`

Creates an Astro API endpoint handler. Returns a function compatible with Astro's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
