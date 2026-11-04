<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Nuxt</h1>

  <p><strong>Typed calls to any backend, from a Nitro route and every page Nuxt renders.</strong></p>

  <p>One server route proxies every endpoint your pages may call, and <code>useAsyncData</code> calls it on the server and in the browser alike — with the user's session as the page is rendered.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-nuxt"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-nuxt?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/nuxt"><strong>Nuxt guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/nuxt">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The Nuxt adapter is an h3 event handler: it serves Courier's proxy from a Nitro server route, on Nuxt 3 and 4 and any h3-based server, without depending on which h3 your package manager installs.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One route</h4>
      <code>courierHandler()</code> in <code>server/api/request.ts</code> answers every endpoint marked <code>.expose()</code>.
    </td>
    <td width="33%" valign="top">
      <h4>Rendered with the session</h4>
      A Nitro plugin gives every call a page or a server route makes the session of the request it serves.
    </td>
    <td width="33%" valign="top">
      <h4>Server and browser</h4>
      The same composable calls the proxy in-process during server rendering, and over HTTP in the browser.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Streams</h4>
      The same route serves SSE streams; WebSocket channels run on the standalone Courier server.
    </td>
    <td valign="top">
      <h4>Any h3</h4>
      h3 1.x and 2.x events alike, and a body Nitro already holds, on Node.js and the edge presets.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Nuxt project:

```bash
npx @noverax/create-courier
```

It adds the server route, registered from a Nitro plugin, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework nuxt`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-nuxt @noverax/courier
```

<br />

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

<br />

## How It Works

The handler takes the Web `Request` from the h3 event it is given — directly from an h3 2.x event, and converted from Node's request inside an h3 1.x event, which is what Nitro 2, and so Nuxt 3 and 4, hands a route. It does not import `h3` itself, so it never depends on which h3 version your package manager installs: do not add `h3` to your dependencies for it. Nuxt brings the h3 it runs, and a separately installed `h3` can resolve to another major — its 2.x line, where Nuxt 4 runs 1.x.

A body Nitro already holds — a call made in-process with `$fetch`, or any request on an edge preset — is taken from where Nitro keeps it.

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`. In `nuxt dev`, a client that declares an oversized upload can see the connection close before it has sent it all, rather than read the 413.

<br />

## Client-Side

Add the routes module, so every page — and the server that renders it — gets the routes its proxy client may call, built from `courier.config.ts`.

The module runs on `@noverax/courier-build`, which only the build needs, so install it as a dev dependency:

```bash
npm install --save-dev @noverax/courier-build
```

Then add it:

```ts
// nuxt.config.ts
import { courierRoutesModule } from "@noverax/courier-nuxt/plugin"

export default defineNuxtConfig({ modules: [courierRoutesModule] })
```

Register the config once, so `routes` is typed from it. In Nuxt 4 the file goes in `app/`, beside the pages, and imports the config from the folder above; in Nuxt 3, whose app has no `app/` folder, `courier-env.d.ts` sits beside the config and imports `./courier.config`. A client made in `shared/`, which Nuxt 4 compiles apart from `app/`, registers the config in its own module instead: every tsconfig that compiles the module sees it there.

```ts
// app/courier-env.d.ts — Nuxt 4
import type config from "../courier.config"

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config
  }
}
```

Then use `createProxyCaller` in a composable:

```ts
// composables/useCaller.ts
import { createProxyCaller } from "@noverax/courier"
import { routes } from "@noverax/courier/routes"

// What a page may call of the source registered as `api`, and how. The API
// definition — upstream URL, endpoint paths, middleware — stays on the server.
export function useCaller() {
  // `useAsyncData` runs on the server first, where the call reaches the proxy
  // in the same process; in the browser the path goes to the route over HTTP.
  return createProxyCaller(routes.api, { proxyPath: { http: "/api/request" } })
}
```

A project that would rather keep the routes in its tree writes them with `npx @noverax/courier-cli routes`, and gives the caller `apiRoutes` from `~/courier.routes` in place of `routes.api`. The module builds the routes under Nuxt's Vite builder, and under its webpack and Rspack builders through the same rules as `@noverax/courier-build/webpack`; added to an app that builds with any other, it throws `UnsupportedBuilderError` (`UNSUPPORTED_BUILDER`), which says to write the routes module instead.

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

During server rendering the call does not leave the server: the proxy caller reaches the proxy in the same process, where the Nitro plugin registered the source. An API that keeps a `session` gets the session of the user the page is rendered for once Nitro serves each request with it at hand:

```ts
// server/plugins/courier-request.ts
import { requestContextPlugin } from "@noverax/courier-nuxt"

export default defineNitroPlugin(requestContextPlugin)
```

The session cookies the API sets then reach the browser on the response, during server rendering as from a server route.

The same route serves SSE streams: point `proxyPath.sse` at it too. WebSocket channels need the standalone Courier server.

<br />

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

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
    </td>
  </tr>
</table>

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
