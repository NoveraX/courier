<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Astro</h1>

  <p><strong>Typed calls to any backend, from an endpoint Astro renders on demand.</strong></p>

  <p>One API endpoint proxies every call your pages may make, beside pages that stay prerendered — with the user's session in pages, endpoints and actions.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-astro"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-astro?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/astro"><strong>Astro guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/astro">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The Astro adapter serves Courier's proxy from an API endpoint rendered on demand — `export const prerender = false` — so the rest of the site can stay static, on any server adapter.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One endpoint</h4>
      <code>courierHandler()</code> in <code>src/pages/api/request.ts</code> answers every endpoint marked <code>.expose()</code>.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      <code>requestContext()</code> gives every page, endpoint and action the session of the request being served.
    </td>
    <td width="33%" valign="top">
      <h4>Static beside it</h4>
      Only the proxy renders on demand; every other page stays prerendered.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Uploads</h4>
      Up to 10 MB unless you raise it, with Astro's own origin check named for production.
    </td>
    <td valign="top">
      <h4>Cancelled calls</h4>
      When the browser cancels, the proxy stops its upstream request too, under <code>@astrojs/node</code>.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Astro project:

```bash
npx @noverax/create-courier
```

It adds the endpoint, rendered on demand and registered from the middleware, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework astro`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-astro @noverax/courier astro
npx astro add node
```

The proxy answers each call as it arrives, so its route renders on demand, and that needs a server adapter. `@astrojs/node` is shown; any adapter works.

<br />

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

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a page, an endpoint or an action makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```ts
// src/middleware.ts
import { requestContext } from "@noverax/courier-astro/request-context"

export const onRequest = requestContext()
```

The session cookies the API sets reach the browser through Astro's `cookies`. Name your domains in `security.allowedDomains`, or Astro takes every request for `http://localhost`. It needs `AsyncLocalStorage`: Node, or Cloudflare with `nodejs_compat`.

<br />

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

// The routes Courier writes from the endpoints you mark .expose():
// what a page may call, under the key the source has in your `sources` map.
const caller = createProxyCaller(apiRoutes, {
  proxyPath: { http: "/api/request" },
})
const users = await caller.users.getAll()
```

<br />

## Cancelled calls

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request, following the request's signal. `@astrojs/node` fires that signal when the client leaves. The `astro dev` server does not, and exposes no connection to watch instead, so during development a cancelled call still runs to completion upstream.

<br />

## API

### `courierHandler()`

Creates an Astro API endpoint handler. Returns a function compatible with Astro's `GET`/`POST` exports.

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
