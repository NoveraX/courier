<div align="center">
  <br />

  # @noverax/courier-nuxt

  **Nuxt / Nitro / h3 adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-nuxt"><img src="https://img.shields.io/npm/v/@noverax/courier-nuxt?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-nuxt @noverax/courier h3
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

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by the Nitro plugin at server start. Works with Nuxt 3, Nitro, and any h3-based server.

## How It Works

Uses `h3.fromWebHandler()` to wrap the core Web Standard handler as an h3 event handler. Since Nitro/h3 supports Web Standard APIs, the conversion is lightweight.

## Client-Side

Use `createProxyCaller` in a composable:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import type { api } from "~/api/sources"

export const caller = createProxyCaller<typeof api>({ source: api, proxyPath: { http: "/api/request" } })
```

```vue
<script setup lang="ts">
import { caller } from "~/composables/useCaller"

const { data: users } = useAsyncData("users", () =>
  caller.users.getAll()
)
</script>

<template>
  <ul>
    <li v-for="user in users" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

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

[MIT](../../LICENSE)
