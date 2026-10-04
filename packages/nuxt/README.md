<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-nuxt</h1>

  <p><strong>Nuxt / Nitro / h3 adapter for Courier.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-nuxt"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-nuxt?style=flat-square&label=npm&labelColor=0e1116&color=6d28d9" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-6d28d9?style=flat-square&labelColor=0e1116" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/nuxt">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-nuxt @noverax/courier
```

## Usage

Register sources in a Nitro server plugin, then create a server route:

```ts
// server/plugins/courier.ts
import { registerSources } from "@noverax/courier"
import { sources } from "~/api/sources"

export default defineNitroPlugin(() => registerSources(sources))
```

```ts
// server/api/request.ts
import { courierHandler } from "@noverax/courier-nuxt"

export default courierHandler()
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by the Nitro plugin at server start. Works with Nuxt 3 and 4, Nitro, and any h3-based server.

## How It Works

The handler takes the Web `Request` from the h3 event it is given — directly from an h3 2.x event, and converted from Node's request inside an h3 1.x event, which is what Nitro 2, and so Nuxt 3 and 4, hands a route. It does not import `h3` itself, so it never depends on which h3 version your package manager installs: do not add `h3` to your dependencies for it. Nuxt brings the h3 it runs, and a separately installed `h3` can resolve to another major — its 2.x line, where Nuxt 4 runs 1.x.

A body Nitro already holds — a call made in-process with `$fetch`, or any request on an edge preset — is taken from where Nitro keeps it.

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`. In `nuxt dev`, a client that declares an oversized upload can see the connection close before it has sent it all, rather than read the 413.

## Client-Side

Use `createProxyCaller` in a composable:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "~/api/sources"

// Imported as a type: the API definition — upstream URL, endpoint paths,
// middleware — stays on the server. An API with streams or channels passes a
// `boundary` from `defineBoundary` instead (see the proxy-mode docs).
export function useCaller() {
  // `useAsyncData` runs on the server first, where a bare "/api/request"
  // has no page to resolve against — so it is made absolute with the origin
  // of the request being rendered.
  const { origin } = useRequestURL()
  return createProxyCaller<typeof api>("api", { proxyPath: { http: `${origin}/api/request` } })
}
```

```vue
<script setup lang="ts">
const caller = useCaller()

const { data: users } = await useAsyncData("users", () => caller.users.getAll())
</script>

<template>
  <ul>
    <li v-for="user in users" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

During server rendering the call is a request from the server to itself, so it carries none of the browser's cookies. When the upstream needs the user's session, forward it: `createProxyCaller("api", { proxyPath, headers: useRequestHeaders(["cookie"]) })`. The proxy passes cookies on only to the sources and endpoints that name `cookie`, with `allowedHeaders` or `.headers()`.

The same route serves SSE streams: point `proxyPath.sse` at it too. WebSocket channels need the standalone Courier server.

## Server-Side

Call endpoints directly in Nitro routes:

```ts
// server/api/dashboard.ts
import { createCaller } from "@noverax/courier"
import { api } from "~/api/sources"

const caller = createCaller(api)

export default defineEventHandler(async () => {
  const users = await caller.users.getAll()
  return { users }
})
```

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
