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
2. **`createAction`** — type-safe Server Actions with FormData parsing, revalidation, and error handling

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

### ActionState Type

Convenience type for `useActionState` return values:

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
