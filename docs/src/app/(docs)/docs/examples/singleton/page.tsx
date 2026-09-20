import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const singletonCode = `// lib/query.ts — Single typed instance for the entire app
import type { api } from "@/api"
import { createProxyQueryCaller } from "@noverax/courier-react"

export const q = createProxyQueryCaller<typeof api>("api")

// typeof api carries full type information:
// - Group names and endpoint names
// - Response types and variable types per endpoint
// q.group.useQuery("endpoint") — full autocompletion`

const sourcesCode = `// api/index.ts — Define and export the API source
import { defineApi } from "@noverax/courier/define"

export const api = defineApi({
  baseURL: "http://localhost:4000",
  groups: {
    users,  // Users group with CRUD endpoints
    posts,  // Posts group
    files,  // File upload endpoints
  },
})`

const methodTypeCode = `// How the builder chain drives the type system
import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

const users = defineGroup({
  prefix: "users",
  endpoints: {
    // .variables() and .response() carry the types forward
    getAll: endpoint.response<UserListResponse>().get(""),

    getById: endpoint.variables<{ id: number }>().response<User>().get(":id"),

    create: endpoint.variables<CreateUserInput>().response<User>().post(""),

    update: endpoint.variables<{ id: number } & Partial<CreateUserInput>>().response<User>().put(":id"),

    delete: endpoint.variables<{ id: number }>().response<{ success: boolean }>().del(":id"),
  },
})

// These types flow through the entire chain:
// endpoint → defineGroup → defineApi → createProxyQueryCaller
// → q.group.useQuery("endpoint") → call site`

const inferenceCode = `// Full type inference at call site — no manual types needed

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
//    ^? User`

const multiInstanceCode = `// Multiple instances for different backends
import { createProxyQueryCaller } from "@noverax/courier-react"

// Internal API
export const internalQ = createProxyQueryCaller<typeof internalApi>("internalApi", {
  timeout: 5000,
  headers: { "X-Internal": "true" },
})

// External API
export const externalQ = createProxyQueryCaller<typeof externalApi>("externalApi", {
  timeout: 15000,
  onError: (error) => Sentry.captureException(error),
})

// Usage — each instance is fully typed independently
const { data } = internalQ.users.useQuery("getAll")
const { mutate } = externalQ.payments.useMutation("charge")`

const directCode = `// Direct mode — same type system, no proxy
import { createCaller } from "@noverax/courier"
import { api } from "@/api"

export const caller = createCaller(api)

// Server Component or Server Action
const users = await caller.users.getAll()
//    ^? { data: User[], total: number }`

export const metadata = docsMetadata(
  "Typed Singleton",
  "Create a single typed request instance with full type inference across your entire application."
)

export default function SingletonExamplesPage() {
  return (
    <>
      <PageHeader
        title="Typed Singleton"
        description="Create a single typed request instance with full type inference across your entire application."
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="The Singleton Pattern"
          description="One createProxyQueryCaller call exports typed hooks for the entire app."
          code={singletonCode}
          learnMoreHref="/docs/advanced/singleton"
          learnMoreLabel="Singleton docs"
        >
          <p className="text-sm text-muted-foreground">
            The generic parameter{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"<typeof api>"}</code> carries
            all group, endpoint, response, and variable types. Every call site gets full
            autocompletion and type checking via dot-notation.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Source Definition"
          description="Define sources with defineApi and defineGroup functions. Export the sources map and its type."
          code={sourcesCode}
        >
          <p className="text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">typeof api</code> type is
            derived from the actual definitions — no need to manually define or sync types.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Method Types"
          description="The builder chain is the foundation of the type system."
          code={methodTypeCode}
        >
          <p className="text-sm text-muted-foreground">
            Each endpoint declares its response and variables types. These flow through the chain:
            courier → defineGroup → defineApi → createProxyQueryCaller → q.group.useQuery.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Type Inference"
          description="Full autocompletion and type checking at every call site — no manual types needed."
          code={inferenceCode}
        >
          <p className="text-sm text-muted-foreground">
            TypeScript infers group names, endpoint names, response types, and variable types
            automatically via dot-notation. Errors are caught at compile time.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Multiple Instances"
          description="Create separate typed instances for different backends with independent defaults."
          code={multiInstanceCode}
        >
          <p className="text-sm text-muted-foreground">
            Each instance has its own type parameter, defaults (timeout, headers, error handling),
            and is fully independent.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Direct Mode"
          description="createCaller uses the same type system for server-side usage."
          code={directCode}
        >
          <p className="text-sm text-muted-foreground">
            Direct mode shares the same sources and type inference. Use it in Server Components and
            Server Actions without the proxy hop.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
