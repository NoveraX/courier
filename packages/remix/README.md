<div align="center">
  <br />

  # @noverax/courier-remix

  **Remix adapter for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-remix"><img src="https://img.shields.io/npm/v/@noverax/courier-remix?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-remix @noverax/courier
```

Remix continues as React Router 7's framework mode, which is what `npx create-react-router@latest` sets up, and the handler works with both.

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request, following the request's signal. React Router 7 hands a resource route a rebuilt copy of the request, and the copy's signal does not reliably follow the original: a cancelled upload to a slow upstream was seen to run to completion on both `react-router dev` and `react-router-serve`. The future flag that passes the request through unchanged keeps the cancellation:

```ts
// react-router.config.ts
export default {
  future: { v8_passThroughRequests: true },
}
```

## API

### `courierHandler()`

Creates a resource route handler. Returns a function compatible with the `loader`/`action` exports of React Router 7 and Remix v2.

## License

[MIT](../../LICENSE)
