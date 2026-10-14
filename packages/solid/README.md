<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for SolidStart</h1>

  <p><strong>Typed calls to any backend, from one SolidStart API route.</strong></p>

  <p>One API route proxies every endpoint your pages may call, and every query, server function and action calls your backend with the session of the request it serves.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-solid"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-solid?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/solid-start"><strong>SolidStart guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/solid">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The SolidStart adapter serves Courier's proxy from an API route on Web Standard `Request` and `Response`, and finds the request SolidStart is serving so every call carries its session.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One route</h4>
      <code>courierHandler()</code> in <code>src/routes/api/request.ts</code> answers every endpoint marked <code>.expose()</code>.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      Register SolidStart's <code>getRequestEvent</code> once, and every query, server function and action carries the session.
    </td>
    <td width="33%" valign="top">
      <h4>Streamed pages</h4>
      <code>deferStream</code> keeps a renewed session cookie in the response a page streams.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Bounded</h4>
      JSON up to 1 MB and uploads up to 10 MB, unless you raise them.
    </td>
    <td valign="top">
      <h4>Cancelled calls</h4>
      When the browser cancels, the proxy stops its upstream request — in development and in production.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your SolidStart project:

```bash
npx @noverax/create-courier
```

It adds the API route, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework solid-start`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-solid @noverax/courier @solidjs/start
```

<br />

## Usage

```ts
// src/entry-server.tsx
import { registerSources } from "@noverax/courier"
import { sources } from "~/api"

registerSources(sources)
```

```ts
// src/routes/api/request.ts
import { courierHandler } from "@noverax/courier-solid"

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` at server startup. The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`.

Solid Start renders the page for a method the route does not export, so `PUT`, `DELETE` or `OPTIONS` on `/api/request` answer 200 with HTML rather than an error. Courier clients send only `GET` and `POST`; export the handler for the other methods too if anything else may call the route, and the proxy answers them with 405. In development, the dev server turns an upstream's `205 Reset Content` into a 500.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a page's `query`, a server function, an action or an API route makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else. SolidStart keeps that request itself; register its `getRequestEvent` once:

```tsx
// src/entry-server.tsx
import { registerRequestContext } from "@noverax/courier"
import { solidStartRequestContext } from "@noverax/courier-solid"
import { getRequestEvent } from "solid-js/web"

registerRequestContext(solidStartRequestContext(getRequestEvent))
```

The session cookies the API sets reach the browser on the response SolidStart prepares, an error response's too. A page streams: load what may renew the session with `deferStream: true`, so the page waits for it — a cookie set after its first part was sent cannot reach the browser, and the log says so.

<br />

## With Frontend

Pair with `createProxyCaller` on the client:

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

// The routes Courier Studio writes from the endpoints you mark .expose():
// what a page may call, under the key the source has in your `sources` map.
const caller = createProxyCaller(apiRoutes, {
  proxyPath: { http: "/api/request" },
})
const users = await caller.users.getAll()
```

<br />

## Cancelled calls

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request. The dev server builds the request without a signal that reports a client leaving, so the handler watches the Node response on the event's `nativeEvent` as well, in development and in production alike.

<br />

## API

### `courierHandler()`

Creates a Solid Start API route handler. Returns a function compatible with Solid Start's `GET`/`POST` exports.

### `solidStartRequestContext(getRequestEvent)`

The provider `registerRequestContext` takes, finding the request SolidStart is serving. `solidStartIncomingRequest(event)` reads one request event as the session does.

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
