<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-solid</h1>

  <p><strong>Solid Start adapter for Courier.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-solid"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-solid?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/solid">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-solid @noverax/courier @solidjs/start
```

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request. The dev server builds the request without a signal that reports a client leaving, so the handler watches the Node response on the event's `nativeEvent` as well, in development and in production alike.

## API

### `courierHandler()`

Creates a Solid Start API route handler. Returns a function compatible with Solid Start's `GET`/`POST` exports.

### `solidStartRequestContext(getRequestEvent)`

The provider `registerRequestContext` takes, finding the request SolidStart is serving. `solidStartIncomingRequest(event)` reads one request event as the session does.

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
