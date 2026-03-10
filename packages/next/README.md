<div align="center">
  <br />

  # @noverax/nexus-next

  **Next.js adapter — API route handler + Server Actions.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-next"><img src="https://img.shields.io/npm/v/@noverax/nexus-next?color=7c3aed&style=flat-square" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@noverax/nexus-next"><img src="https://img.shields.io/bundlephobia/minzip/@noverax/nexus-next?color=f59e0b&label=size&style=flat-square" alt="size" /></a>

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
npm install @noverax/nexus-next @noverax/nexus next
```

<br />

## API Route

Create a single catch-all route that handles all Nexus endpoints:

```ts
// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus-next"
import { sources } from "@/api/sources"

export const { GET, POST } = apiRoute(sources)
```

That's it. The proxy caller on the client will POST to this route, and query-type endpoints can also use GET for caching.

<br />

## Server Actions

### Setup

```ts
// app/users/actions.ts
"use server"
import { createAction } from "@noverax/nexus-next"
import { sources } from "@/api/sources"

const action = createAction(sources)

export const createUser = action("api")("users:create", {
  revalidatePath: "/users",
})

export const deleteUser = action("api")("users:remove", {
  revalidateTag: "users",
})
```

### With `useActionState`

```tsx
"use client"
import { useActionState } from "react"
import { createUser } from "./actions"

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, {
    data: null,
    error: null,
  })

  return (
    <form action={formAction}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button disabled={pending}>Create</button>

      {state.error && <p className="error">{state.error.message}</p>}
      {state.data && <p>Created: {state.data.name}</p>}
    </form>
  )
}
```

### Action Options

```ts
action("api")("users:create", {
  revalidatePath: "/users",              // revalidate a path after success
  revalidateTag: "users",               // revalidate a cache tag
  revalidatePath: ["/users", "/admin"],  // multiple paths
  headers: true,                         // forward request headers (default: true)
  parse: "raw",                          // pass raw FormData to endpoint
})
```

### ActionState Type

Every Server Action returns `ActionState<T>`:

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
import { apiRoute, createAction } from "@noverax/nexus-next"

// Actions-only entry (for "use server" files)
import { createAction } from "@noverax/nexus-next/actions"
```

<br />

## License

[MIT](../../LICENSE)
