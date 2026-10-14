<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Next.js</h1>

  <p><strong>Your API in the App Router — one route, Server Actions and the user's session.</strong></p>

  <p>One route proxies every endpoint a page may call. Server Components, Route Handlers and Server Actions call your backend directly, with the session of the user they serve — typed end to end, from one definition.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-next"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-next?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/frameworks/nextjs"><strong>Next.js guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/next">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/architecture-dark.png" />
    <img alt="Server code, the browser and realtime clients call through Courier — types, validation, middleware, the proxy route and streams — to any REST backend; Studio and the mock servers work from the same definition" src="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/architecture-light.png" width="880" />
  </picture>
  <br />
</div>

<br />

## Overview

The Next.js App Router integration. `apiRoute` serves every endpoint the browser may call from one route; `createServerCaller` and `createAction` call your backend from Server Components, Route Handlers and Server Actions with the session of the request Next.js is serving; and a middleware hands a page the double-submit token its write repeats.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One route</h4>
      <code>apiRoute()</code> answers every endpoint marked <code>.expose()</code>, in the Node.js and the Edge runtime alike.
    </td>
    <td width="33%" valign="top">
      <h4>Server Actions</h4>
      <code>createAction</code> calls your API from a Server Action, typed and ready for <code>useActionState</code>.
    </td>
    <td width="33%" valign="top">
      <h4>The user's session</h4>
      Every call a page, a layout, an action or a route makes carries the session of the request being served.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>CSRF handled</h4>
      A write another site set off is refused with 403; a middleware hands a page the token its write repeats.
    </td>
    <td valign="top">
      <h4>Rendered per request</h4>
      A page that reads the session renders per request — also when <code>next build</code> decides what it can build ahead of time.
    </td>
    <td valign="top">
      <h4>Pages Router too</h4>
      <code>withRequestContext</code> gives <code>getServerSideProps</code> and API routes their request at hand.
    </td>
  </tr>
</table>

<br />

## Quick start

In your Next.js project:

```bash
npx @noverax/create-courier
```

It adds the proxy route, registered from `instrumentation.ts`, a typed example API, Studio and a mock — showing each change to your files before it makes it — installs the packages and type-checks the result. For a new project: `npx @noverax/create-courier my-app --framework next`. The steps below do the same by hand.

<br />

## Install

```bash
npm install @noverax/courier-next @noverax/courier next
```

<br />

## API Route

Register sources in `instrumentation.ts`, then create a single catch-all route that handles all Courier endpoints:

```ts
// instrumentation.ts
import { registerSources } from "@noverax/courier"

export async function register() {
  const { sources } = await import("@/api/sources")
  registerSources(sources)
}
```

```ts
// app/api/request/route.ts
import { apiRoute } from "@noverax/courier-next"

export const { GET, POST } = apiRoute()
```

`register()` runs once in each runtime the app uses, and each runtime has its own registry: a route with `export const runtime = "edge"` reads the Edge runtime's, so the sources are registered in both. If your sources module imports Node-only code, register an Edge-safe one when `process.env.NEXT_RUNTIME === "edge"`. `sseRoute()` streams in the Edge Runtime as well as in Node.js.

That's it. `apiRoute()` is zero-arg — sources are read at request time from the core global registry. The proxy caller on the client will POST to this route, and query-type endpoints can also use GET for caching.

Pages on other origins may call the route when `allowedOrigins` lists them. Their browser sends a preflight first, so export `OPTIONS` as well — from `sseRoute()` too, if they subscribe to streams:

```ts
export const { GET, POST, OPTIONS } = apiRoute({ allowedOrigins: ["https://admin.example.com"] })
```

The route answers only for the host names the app is reached by, which stops a DNS-rebinding page: `localhost`, `*.localhost` and IP addresses always, and in production every name until `allowedHosts` lists them. Any other host gets `421`. A dev server reached by another name lists it: `apiRoute({ allowedHosts: ["myapp.test"] })`.

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `apiRoute({ maxUploadBytes: 50 * 1024 * 1024 })`.

<br />

## The user's session

An API that keeps the user's session describes it in `defineApi` — the cookies it is kept in, a bearer cookie, the double-submit token writes repeat — and server code calls it through `createServerCaller`:

```ts
// lib/api.server.ts
import { createServerCaller } from "@noverax/courier-next"
import { api } from "@/api"

export const server = createServerCaller(api)
```

Every call a page, a layout, a Server Action or a Route Handler makes through it carries the session of the request Next.js is serving — the cookies the session names and nothing else of your application's — and a page that reads it is rendered per request, also when `next build` decides which pages it can build ahead of time. A write another site set off is refused with 403. The session cookies the API sets reach the browser from a Server Action and a Route Handler; Next.js lets no page set cookies while it renders. The Pages Router wraps `getServerSideProps` and API routes with `withRequestContext` from `@noverax/courier-next/pages`.

A page that writes while it renders cannot hand the browser the double-submit token its write asks for, so a middleware hands it over with the page, and gives it to the render too:

```ts
// proxy.ts (middleware.ts, exporting middleware, before Next.js 16)
import { csrfTokenMiddleware } from "@noverax/courier-next/middleware"
import { api } from "@/api"

export const proxy = csrfTokenMiddleware(api)
export const config = { matcher: ["/account/:path*"] }
```

<br />

## Server Actions

### Setup

```ts
// lib/actions.ts
import { createAction } from "@noverax/courier-next"
import { sources } from "@/api/sources"

export const action = createAction(sources, "api")
```

```ts
// app/actions/users.ts
"use server"
import { revalidatePath } from "next/cache"
import { action } from "@/lib/actions"

export async function createUser(data: { name: string; email: string }) {
  const user = await action.users.create(data)
  revalidatePath("/users")
  return user
}

export async function deleteUser(id: number) {
  await action.users.remove({ id })
  revalidatePath("/users")
}
```

### ActionDefaults

```ts
createAction(sources, "api", {
  headers: true,  // forward request headers via next/headers (default: true)
})
```

An API that keeps a `session` gets the user's session from the action's request whichever `headers` says, and the session cookies it sets reach the browser with the action's response.

`createAction` takes the same sources map you pass to `registerSources`, and the client it returns has the shape of the named source — grouped, flat, or both. It only forwards each call: revalidating, reading `FormData` and handling errors stay in your action, as above.

### ActionState Type

A type for the state your action hands `useActionState`. `createAction` does not produce it; your action builds it:

```ts
type ActionState<T> = {
  data: T | null
  error: {
    message: string
    status?: number
    issues?: ValidationIssue[]  // from Standard Schema validation
  } | null
}
```

```ts
"use server"
import { HTTPError, isValidationError } from "@noverax/courier"
import type { ActionState } from "@noverax/courier-next"
import { action } from "@/lib/actions"

type User = { id: number; name: string }

export async function saveUser(_: ActionState<User>, form: FormData): Promise<ActionState<User>> {
  try {
    const user = await action.users.create({ name: String(form.get("name")) })
    return { data: user, error: null }
  } catch (error) {
    if (isValidationError(error)) return { data: null, error: { message: error.message, issues: error.issues } }
    if (error instanceof HTTPError) return { data: null, error: { message: error.message, status: error.status } }
    throw error
  }
}
```

<br />

## Exports

```ts
// Main entry
import { apiRoute, createAction, createServerCaller, nextRequestContext } from "@noverax/courier-next"
```

```ts
// Actions-only entry (for "use server" files)
import { createAction } from "@noverax/courier-next/actions"
```

```ts
// Pages Router: getServerSideProps and API routes with their request at hand
import { withRequestContext } from "@noverax/courier-next/pages"
```

```ts
// Middleware: hand the double-submit token to the browser with the page
import { csrfTokenMiddleware, handCsrfTokens } from "@noverax/courier-next/middleware"
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
      <a href="https://github.com/NoveraX/courier/tree/master/packages/react"><strong>@noverax/courier-react</strong></a><br />
      React Query hooks typed from the same definition.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
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
