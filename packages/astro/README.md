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
// src/pages/api/request.ts
import { nexusHandler } from "@noverax/nexus-astro"
import { sources } from "../../api"

const handler = nexusHandler(sources)
export const GET = handler
export const POST = handler
```

The handler wraps Astro's Web Standard `Request` and passes it to the core Nexus handler. Works with both static and SSR output modes.

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/nexus"

const caller = createProxyCaller({ proxyPath: { http: "/api/request" } })
const users = await caller.users.getAll()
```

## API

### `nexusHandler(sources)`

Creates an Astro API endpoint handler. Takes a `Sources` object and returns a function compatible with Astro's `GET`/`POST` exports.

## License

[MIT](../../LICENSE)
