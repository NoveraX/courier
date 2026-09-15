<div align="center">
  <br />

  # @noverax/nexus-astro

  **Astro adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-astro"><img src="https://img.shields.io/npm/v/@noverax/nexus-astro?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-astro @noverax/nexus astro
```

## Usage

```ts
// src/middleware.ts
import { registerSources } from "@noverax/nexus"
import { sources } from "./api"

registerSources(sources)
```

```ts
// src/pages/api/request.ts
import { nexusHandler } from "@noverax/nexus-astro"

const handler = nexusHandler()
export const GET = handler
export const POST = handler
```

`nexusHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at module load. Works with both static and SSR output modes.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler()`

Creates an Astro API endpoint handler. Returns a function compatible with Astro's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
