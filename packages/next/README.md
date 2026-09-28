<div align="center">
  <br />

  # @noverax/courier-next

  **Next.js adapter — API route handler + Server Actions.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-next"><img src="https://img.shields.io/npm/v/@noverax/courier-next?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/courier-next"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/courier-next?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

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
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sources } = await import("@/api/sources")
    registerSources(sources)
  }
}
```

```ts
// app/api/request/route.ts
import { apiRoute } from "@noverax/courier-next"

export const { GET, POST } = apiRoute()
```

That's it. `apiRoute()` is zero-arg — sources are read at request time from the core global registry. The proxy caller on the client will POST to this route, and query-type endpoints can also use GET for caching.

Pages on other origins may call the route when `allowedOrigins` lists them. Their browser sends a preflight first, so export `OPTIONS` as well — from `sseRoute()` too, if they subscribe to streams:

```ts
export const { GET, POST, OPTIONS } = apiRoute({ allowedOrigins: ["https://admin.example.com"] })
```

The proxy reads a JSON call up to its `maxBodyBytes`, 1 MB, and an upload (`multipart/form-data`) up to its `maxUploadBytes`, 10 MB; pass others to raise them: `apiRoute({ maxUploadBytes: 50 * 1024 * 1024 })`.

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
import { apiRoute, createAction } from "@noverax/courier-next"

// Actions-only entry (for "use server" files)
import { createAction } from "@noverax/courier-next/actions"
```

<br />

## License

[MIT](../../LICENSE)
