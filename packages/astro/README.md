<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-astro</h1>

  <p><strong>Astro adapter for Courier.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-astro"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-astro?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/astro">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-astro @noverax/courier astro
npx astro add node
```

The proxy answers each call as it arrives, so its route renders on demand, and that needs a server adapter. `@astrojs/node` is shown; any adapter works.

## Usage

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware"
import { registerSources } from "@noverax/courier"
import { sources } from "./api"

registerSources(sources)

// Astro requires its middleware module to export `onRequest`.
export const onRequest = defineMiddleware((_context, next) => next())
```

```ts
// src/pages/api/request.ts
import { courierHandler } from "@noverax/courier-astro"

// Rendered on demand: a prerendered route answers every call with the
// same file built once at build time.
export const prerender = false

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at module load.

`export const prerender = false` is what keeps the route on demand in Astro's default static output, where every other page stays prerendered. Without it the build renders the route once, and the deployed site answers every call with that file: a `POST` gets 200 and the same error body, with nothing to show it failed. With `output: "server"` routes are on demand already and the line changes nothing.

### Uploads

Astro checks the `Origin` of form submissions — `multipart/form-data`, which uploads use — against the origin it believes it serves, and answers a mismatch with a plain-text 403 "Cross-site POST form submissions are forbidden" before the proxy sees the call. A caller that sends no `Origin` at all, such as a server-side script, is refused the same way. When a same-origin upload is refused in production, Astro could not tell its own address; name it:

```js
// astro.config.mjs
import { defineConfig } from "astro/config"
import node from "@astrojs/node"

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  security: { allowedDomains: [{ protocol: "https", hostname: "app.example.com" }] },
})
```

The proxy reads an upload up to its `maxUploadBytes` — 10 MB unless you pass another, as in `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })` — and a JSON call up to `maxBodyBytes`, 1 MB.

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request, following the request's signal. `@astrojs/node` fires that signal when the client leaves. The `astro dev` server does not, and exposes no connection to watch instead, so during development a cancelled call still runs to completion upstream.

## API

### `courierHandler()`

Creates an Astro API endpoint handler. Returns a function compatible with Astro's `GET`/`POST` exports.

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
