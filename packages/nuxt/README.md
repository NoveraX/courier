<div align="center">
  <br />

  # @noverax/nexus-nuxt

  **Nuxt / Nitro / h3 adapter for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-nuxt"><img src="https://img.shields.io/npm/v/@noverax/nexus-nuxt?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-nuxt @noverax/nexus h3
```

## Usage

Create a server route in your Nuxt app:

```ts
// server/api/request.ts
import { nexusHandler } from "@noverax/nexus-nuxt"
import { sources } from "~/api/sources"

export default nexusHandler(sources)
```

Works with Nuxt 3, Nitro, and any h3-based server.

## How It Works

Uses `h3.fromWebHandler()` to wrap the core Web Standard handler as an h3 event handler. Since Nitro/h3 supports Web Standard APIs, the conversion is lightweight.

## Client-Side

Use `createProxyCaller` in a composable:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/nexus"
import type { Sources } from "~/api/sources"

export const caller = createProxyCaller<Sources>({ proxyUrl: "/api/request" })
```

```vue
<script setup lang="ts">
import { caller } from "~/composables/useCaller"

const { data: users } = useAsyncData("users", () =>
  caller("api")("users:getAll")
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
import { createCaller } from "@noverax/nexus"
import { sources } from "~/api/sources"

const call = createCaller(sources)

export default defineEventHandler(async () => {
  const users = await call("api")("users:getAll")
  return { users }
})
```

## License

[MIT](../../LICENSE)
