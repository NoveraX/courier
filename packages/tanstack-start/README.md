<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for TanStack Start</h1>

  <p><strong>Typed calls to any backend, from TanStack Start's server routes and server functions.</strong></p>

  <p>Two server routes proxy every endpoint your pages may call and every stream they open, and every server function, loader and route calls your backend with the session of the request it serves — in a TanStack Start app for React or for Solid.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-tanstack-start"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-tanstack-start?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/tanstack-start"><strong>TanStack Start guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/tanstack-start">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The TanStack Start adapter serves Courier's proxy from server routes on Web Standard `Request` and `Response`, on every server TanStack Start runs on, and finds the request TanStack Start is serving so every call carries its session.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Two routes</h4>
      <code>apiRoute()</code> answers every endpoint marked <code>.expose()</code>, and <code>sseRoute()</code> every stream, where a proxy client looks for them.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      <code>createServerCaller(api)</code> in a server function, or one middleware in <code>src/start.ts</code>, and every call carries the session.
    </td>
    <td width="33%" valign="top">
      <h4>Cancelled calls</h4>
      When the browser cancels, the proxy stops its upstream request — in development and in production.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Bounded</h4>
      JSON up to 1 MB and uploads up to 10 MB, unless you raise them.
    </td>
    <td valign="top">
      <h4>Nothing in the page</h4>
      TanStack Start drops a route's handlers and a middleware's server part from the browser's code, and this package with them.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-tanstack-start @noverax/courier
```

<br />

## Usage

A proxy client sends its calls to `/api/request` and opens its streams at `/api/sse`:

```ts
// src/routes/api/request.ts
import { createFileRoute } from "@tanstack/react-router"
import { apiRoute } from "@noverax/courier-tanstack-start"

export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } })
```

```ts
// src/routes/api/sse.ts
import { createFileRoute } from "@tanstack/react-router"
import { sseRoute } from "@noverax/courier-tanstack-start"

export const Route = createFileRoute("/api/sse")({ server: { handlers: sseRoute() } })
```

A Solid app imports `createFileRoute` from `@tanstack/solid-router`. Register your APIs once, in a module only the server loads:

```ts side="server"
// src/server.ts
import handler from "@tanstack/react-start/server-entry"
import { registerSources } from "@noverax/courier/server"
import { sources } from "./api"

registerSources(sources)

export default handler
```

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `apiRoute({ maxUploadBytes: 50 * 1024 * 1024 })`. A method neither route serves is answered with 405 and `Allow`: TanStack Start would otherwise render your app's page for it.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call server code makes for a request carries the session of that request — the cookies the session names and nothing else. TanStack Start keeps the request itself; the entry for your framework finds it: `@noverax/courier-tanstack-start/react`, or `/solid`.

```ts
// src/api.server.ts
import { createServerCaller } from "@noverax/courier-tanstack-start/react"
import { api } from "./api"

export const server = createServerCaller(api)
```

```ts
// src/users.ts
import { createServerFn } from "@tanstack/react-start"
import { server } from "./api.server"

export const getMe = createServerFn().handler(() => server.users.me())
```

`createServerCaller` needs nothing else set up. Keep it where only the server loads it: a loader runs in the browser too. `/react` and `/solid` carry TanStack Start's `server-only` marker, so a build whose page takes either stops. A call made through `@noverax/courier/client` in a loader takes the session while the server renders the page, once every request is served with it at hand:

```ts
// src/start.ts
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { requestContext } from "@noverax/courier-tanstack-start/react"

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
    createMiddleware().server(requestContext()),
  ],
}))
```

Keep TanStack Start's own `createCsrfMiddleware` in the list: once `src/start.ts` is there, TanStack Start no longer adds it to your server functions itself. A page that writes later gets its double-submit token with the page from `createMiddleware().server(csrfTokenMiddleware(api))` in its route's `server.middleware`. The cookies the API sets reach the browser on the response TanStack Start prepares, a redirect's and an error's too. A page streams: a cookie set after its first part was sent cannot reach the browser, and with `requestContext()` the log says so.

<br />

## With Frontend

Add the routes plugin beside TanStack Start's, so every page and the server that renders it get the routes a proxy client may call, built from `courier.config.ts`. It runs on `@noverax/courier-build`, which only the build needs:

```bash
npm install --save-dev @noverax/courier-build
```

```ts
// vite.config.ts
import { courierRoutes } from "@noverax/courier-tanstack-start/plugin"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({ plugins: [tanstackStart(), viteReact(), courierRoutes()] })
```

An app built with Rsbuild takes `courierRoutes()` from `@noverax/courier-tanstack-start/rsbuild` into `rsbuild.config.ts` beside TanStack Start's Rsbuild plugin. Then pair with `createProxyCaller(routes.api)` from `@noverax/courier/client`, the config registered once so `routes` is typed from it — see [Exposing Endpoints](https://courier.noverax.cloud/docs/proxy-mode/expose).

<br />

## Cancelled calls

When the browser cancels a call — an aborted upload, a query it no longer needs, a stream it closes — the proxy stops its own upstream request. TanStack Start's dev server, `vite preview` and Nitro end the request's signal when the client leaves.

<br />

## API

### `apiRoute(config?)`

The handlers of the route the proxy's calls go to: a read over `GET`, a write over `POST`, a preflight over `OPTIONS`, and 405 for any other method, for `server.handlers`.

### `sseRoute(config?)`

The handlers of the route the proxy's streams are opened at: a stream over `GET`, a preflight over `OPTIONS`, and 405 for any other method.

### `courierRoutes(options?)`

From `/plugin` for Vite and `/rsbuild` for Rsbuild: the plugin that builds the routes a page's proxy client may call from `courier.config.ts`, in place of `@noverax/courier/routes`. Under Rsbuild's dev server, `/rsbuild` names a page's scripts by their content, as a build does, so a page loaded after an edit never runs an old copy an engine kept of them; an app that names its scripts itself, or turns the hash in their names off, keeps its names, and one that writes them to disk keeps there those of the last two builds alone. `config` names the config file when it is not the one found from the root.

### `createServerCaller(api, defaults?)`

From `/react` and `/solid`: a caller for server code whose calls carry the session of the request TanStack Start is serving.

### `requestContext()`

From `/react` and `/solid`: the server part of a request middleware, for `createMiddleware().server(…)`, that serves every request with its session at hand.

### `csrfTokenMiddleware(...apis)`

From `/react` and `/solid`: the server part of a request middleware, for `createMiddleware().server(…)` on a page's route, that hands each API's double-submit token to the browser with the page where the request does not carry it.

### `tanstackStartRequestContext`

From `/react` and `/solid`: the provider `registerRequestContext` takes, finding the request TanStack Start is serving.

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
