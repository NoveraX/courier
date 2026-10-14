<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for React Router</h1>

  <p><strong>Typed calls to any backend, from one resource route — React Router 7 and Remix.</strong></p>

  <p>One resource route proxies every endpoint your pages may call, and every loader and action calls your backend with the session of the request it serves.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-remix"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-remix?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/remix"><strong>React Router guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/remix">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Remix continues as React Router 7's framework mode, and the adapter serves both: Courier's proxy as a resource route's `loader` and `action`, on Web Standard `Request` and `Response`, with no conversion.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One route</h4>
      <code>courierHandler()</code> as the route's <code>loader</code> and <code>action</code> answers every endpoint marked <code>.expose()</code>.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      A root middleware gives every loader and action the session of the request being served.
    </td>
    <td width="33%" valign="top">
      <h4>React Router 7 and Remix v2</h4>
      The same handler for both; Remix v2's file routes need no config.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Bounded</h4>
      JSON up to 1 MB and uploads up to 10 MB, unless you raise them.
    </td>
    <td valign="top">
      <h4>Cancelled calls</h4>
      When the browser cancels, the proxy stops its upstream request too.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Another site's page is refused, an unknown host gets 421, and only the cookies the API's session names cross the proxy.
    </td>
  </tr>
</table>

<br />

## Quick start

In your React Router project:

```bash
npx @noverax/create-courier
```

It adds the resource route, listed in `app/routes.ts`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework react-router`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-remix @noverax/courier
```

Remix continues as React Router 7's framework mode, which is what `npx create-react-router@latest` sets up, and the handler works with both.

<br />

## Usage

```ts
// app/routes/api.request.ts
import { registerSources } from "@noverax/courier"
import { courierHandler } from "@noverax/courier-remix"
import { sources } from "~/api"

registerSources(sources)

const handler = courierHandler()
export const loader = handler
export const action = handler
```

React Router 7 serves only the routes `app/routes.ts` lists, so add the file there:

```ts
// app/routes.ts
import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("api/request", "routes/api.request.ts"),
] satisfies RouteConfig
```

On Remix v2, whose file-system routes serve `app/routes/api.request.ts` at `/api/request` without a config, the route file alone is enough.

`courierHandler()` is zero-arg — sources are read at request time from the core global registry that `registerSources()` fills when the route module loads. The handler uses Web Standard `Request`/`Response` natively — no conversion needed. `loader` answers `GET` requests, routed to query-type endpoints, and `action` answers `POST`, for mutations.

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `courierHandler({ maxUploadBytes: 50 * 1024 * 1024 })`. In development, a client that declares an oversized upload can see the connection close before it has sent it all, rather than read the 413.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a loader or an action makes — through every `await` — carries the session of the request being served, the cookies the session names and nothing else, once the request is served with it at hand:

```tsx
// app/root.tsx
import { requestContext } from "@noverax/courier-remix/request-context"

export const middleware = [requestContext()]
```

React Router 7 needs `future: { v8_middleware: true }`. The session cookies the API sets reach the browser on the response. A server of your own wraps its handler with `withRequestContext`. Remix v2 has no middleware: its Express server mounts `requestContext` from `@noverax/courier-express` before Remix's handler.

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request, following the request's signal. React Router 7 hands a resource route a rebuilt copy of the request, and the copy's signal does not reliably follow the original: a cancelled upload to a slow upstream was seen to run to completion on both `react-router dev` and `react-router-serve`. The future flag that passes the request through unchanged keeps the cancellation:

```ts
// react-router.config.ts
export default {
  future: { v8_passThroughRequests: true },
}
```

<br />

## API

### `courierHandler()`

Creates a resource route handler. Returns a function compatible with the `loader`/`action` exports of React Router 7 and Remix v2.

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
