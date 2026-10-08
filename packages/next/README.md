<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-next</h1>

  <p><strong>Next.js adapter — API route handler + Server Actions.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-next"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-next?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/next">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Next.js App Router integration with two features:

1. **`apiRoute`** — single route handler that exposes all your endpoints via GET and POST
2. **`createAction`** — a typed caller for Server Actions that forwards the incoming request's headers

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

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
