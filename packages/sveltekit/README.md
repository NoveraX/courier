<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-sveltekit</h1>

  <p><strong>SvelteKit adapter for Courier.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-sveltekit"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-sveltekit?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/sveltekit">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install @noverax/courier-sveltekit @noverax/courier @sveltejs/kit
```

## Usage

```ts
// src/hooks.server.ts
import { registerSources } from "@noverax/courier"
import { sources } from "$lib/api"

registerSources(sources)
```

```ts
// src/routes/api/request/+server.ts
import { courierHandler } from "@noverax/courier-sveltekit"

const handler = courierHandler()
export const GET = handler
export const POST = handler
```

`courierHandler()` is zero-arg — sources are read at request time from the core global registry populated by `registerSources()` in `hooks.server.ts`. The handler uses Web Standard `Request`/`Response` natively. GET requests are routed to query-type endpoints, POST requests handle mutations.

## In production

SvelteKit answers some calls before the proxy sees them. With `@sveltejs/adapter-node`:

- **Set `ORIGIN`** to the URL the app is served at, such as `ORIGIN=https://app.example.com node build`. Without it SvelteKit cannot tell the protocol it is served over and reports an `https:` request URL, which a browser's `http:` origin never matches, so the proxy refuses every `POST` with 403. Behind a proxy that sets forwarding headers, `PROTOCOL_HEADER` and `HOST_HEADER` do the same job.
- **Raise `BODY_SIZE_LIMIT`**, which is 512 KB by default and answers any larger body with its own 413 `Payload Too Large` — a 900 KB JSON call or any upload over it — whatever the proxy allows. The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload up to its `maxUploadBytes`, 10 MB; `BODY_SIZE_LIMIT=11M` covers both, and a larger `maxUploadBytes` needs a larger limit.
- **Callers without an `Origin`**: SvelteKit's CSRF check refuses a `multipart/form-data` or `text/plain` `POST` whose `Origin` does not match, and one with no `Origin` at all, such as a server-side script, with a plain-text 403. Browser pages on the app's own origin pass it.

In `vite dev`, a chunked body larger than the limit resets the connection instead of answering 413, and a client that declares an oversized upload can see the connection close before it has sent it all.

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

When the browser cancels a call — an aborted upload, a query it no longer needs — the proxy stops its own upstream request. SvelteKit's request signal does not report a client that leaves after its body has arrived, so under `@sveltejs/adapter-node` the handler watches the client's socket, from `platform.req`, instead. The Vite dev server exposes no connection: during `vite dev` a cancelled call still runs to completion upstream.

## The user's session

An API that keeps the user's session describes it in `defineApi`, and every call a hook, a `load` function, a form action or an endpoint makes carries the session of the request being served — the cookies the session names and nothing else of your application's — once the request can be found:

```ts
// src/hooks.server.ts — SvelteKit 2.20 and later
import { getRequestEvent } from "$app/server"
import { registerRequestContext } from "@noverax/courier"
import { svelteKitRequestContext } from "@noverax/courier-sveltekit"

registerRequestContext(svelteKitRequestContext(getRequestEvent))
```

```ts
// src/hooks.server.ts — any SvelteKit 2, where the platform has AsyncLocalStorage
import { requestContextHandle } from "@noverax/courier-sveltekit/handle"

export const handle = requestContextHandle()
```

The session cookies the API sets go to `cookies.set()` exactly as the API wrote them, a `load` function's included.

## API

### `courierHandler()`

Creates a SvelteKit request handler. Returns a function compatible with SvelteKit's `GET`/`POST` server exports.

### `svelteKitRequestContext(getRequestEvent)`

The request SvelteKit 2.20 and later is serving, for `registerRequestContext`.

### `requestContextHandle()`

From `@noverax/courier-sveltekit/handle`: a `handle` hook that serves every request with its session at hand.

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
