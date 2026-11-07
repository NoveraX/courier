<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for TanStack Start</h1>

  <p><strong>Typed calls to any backend, from TanStack Start's server routes.</strong></p>

  <p>Two server routes proxy every endpoint your pages may call and every stream they open — in a TanStack Start app for React or for Solid.</p>

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

The TanStack Start adapter serves Courier's proxy from server routes on Web Standard `Request` and `Response`, on every server TanStack Start runs on.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Two routes</h4>
      <code>apiRoute()</code> answers every endpoint marked <code>.expose()</code>, and <code>sseRoute()</code> every stream, where a proxy client looks for them.
    </td>
    <td width="33%" valign="top">
      <h4>Nothing in the page</h4>
      TanStack Start drops a route's server handlers from the browser's code, and with them your APIs' definitions.
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
      <h4>Every method answered</h4>
      A method the proxy does not serve gets 405 and <code>Allow</code>, never your app's page.
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

```ts
// src/server.ts
import handler from "@tanstack/react-start/server-entry"
import { registerSources } from "@noverax/courier/server"
import { sources } from "./api"

registerSources(sources)

export default handler
```

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `apiRoute({ maxUploadBytes: 50 * 1024 * 1024 })`. A method neither route serves is answered with 405 and `Allow`: TanStack Start would otherwise render your app's page for it.

<br />

## Cancelled calls

When the browser cancels a call — an aborted upload, a query it no longer needs, a stream it closes — the proxy stops its own upstream request. TanStack Start's dev server, `vite preview` and Nitro end the request's signal when the client leaves.

<br />

## API

### `apiRoute(config?)`

The handlers of the route the proxy's calls go to: a read over `GET`, a write over `POST`, a preflight over `OPTIONS`, and 405 for any other method, for `server.handlers`.

### `sseRoute(config?)`

The handlers of the route the proxy's streams are opened at: a stream over `GET`, a preflight over `OPTIONS`, and 405 for any other method.

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
