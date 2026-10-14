/**
 * The code the Typed Singleton example shows, one sample for each of its
 * sections: the singleton itself, the source it is typed from, how the
 * builder chain carries the types, what a call site infers, several
 * instances side by side, and direct mode.
 */
export const SINGLETON_SAMPLES = {
  singleton: `// lib/query.ts — Single typed instance for the entire app
import { createProxyQueryCaller } from "@noverax/courier-react"
import { apiRoutes } from "@/courier.routes"

export const q = createProxyQueryCaller(apiRoutes)

// The routes Courier writes from your .expose() marks carry the API's types:
// - The group and endpoint names a page may call
// - Response types and variable types per endpoint
// q.group.useQuery("endpoint") — full autocompletion`,
  sources: `// api/index.ts — Define and export the API source
import { defineApi } from "@noverax/courier/define"

export const api = defineApi({
  baseURL: "http://localhost:4000",
  // A page may call every endpoint through the proxy
  expose: true,
  groups: {
    users,  // Users group with CRUD endpoints
    posts,  // Posts group
    files,  // File upload endpoints
  },
})`,
  methodType: `// How the builder chain drives the type system
import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

const users = defineGroup({
  prefix: "users",
  endpoints: {
    // .variables() and .response() carry the types forward
    getAll: endpoint.get("").response<UserListResponse>(),

    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),

    create: endpoint.post("").variables<CreateUserInput>().response<User>(),

    update: endpoint.put(":id").variables<{ id: number } & Partial<CreateUserInput>>().response<User>(),

    delete: endpoint.del(":id").variables<{ id: number }>().response<{ success: boolean }>(),
  },
})

// These types flow through the entire chain:
// endpoint → defineGroup → defineApi → courier.routes.ts → createProxyQueryCaller
// → q.group.useQuery("endpoint") → call site`,
  inference: `// Full type inference at call site — no manual types needed

// useQuery infers Response type from the Endpoint definition
const { data } = q.users.useQuery("getAll")
//      ^? { data: User[], total: number } | undefined

// useMutation infers both Response and Variables
const { mutate } = q.users.useMutation("create")
//      ^? (variables: { name: string, email: string, role?: string }) => void

// caller (non-hook) also infers types
const users = await caller.users.getAll()
//    ^? { data: User[], total: number }

// Dot-notation resolves the correct nested type
const user = await caller.users.getById({ id: 1 })
//    ^? User`,
  multiInstance: `// Multiple instances for different backends
import { createProxyQueryCaller } from "@noverax/courier-react"
import { externalApiRoutes, internalApiRoutes } from "@/courier.routes"

// Internal API
export const internalQ = createProxyQueryCaller(internalApiRoutes, {
  timeout: 5000,
  headers: { "X-Internal": "true" },
})

// External API
export const externalQ = createProxyQueryCaller(externalApiRoutes, {
  timeout: 15000,
  onError: (error) => Sentry.captureException(error),
})

// Usage — each instance is fully typed independently
const { data } = internalQ.users.useQuery("getAll")
const { mutate } = externalQ.payments.useMutation("charge")`,
  direct: `// Direct mode — same type system, no proxy
import { createCaller } from "@noverax/courier"
import { api } from "@/api"

export const caller = createCaller(api)

// Server Component or Server Action
const users = await caller.users.getAll()
//    ^? { data: User[], total: number }`,
} as const
