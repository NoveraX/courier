import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const singletonCode = `// lib/query.ts — Single typed instance for the entire app
import type { Sources } from "@/api"
import { createQueryCaller } from "@noverax/nexus-query"

export const { useQuery, useMutation, caller } =
  createQueryCaller<Sources>()

// Sources carries full type information:
// - Source names (keys)
// - Group names and method names per source
// - Response types and variable types per method`

const sourcesCode = `// api/index.ts — Define and export all sources
import { defineApi } from "@noverax/nexus/define"

const api = defineApi({
  baseURL: "http://localhost:4000",
  groups: {
    users,  // Users group with CRUD endpoints
    posts,  // Posts group
    files,  // File upload endpoints
  },
})

export const sources = { api }
export type Sources = typeof sources`

const methodTypeCode = `// How endpoint<Response, Variables> drives the type system
import { defineGroup, endpoint } from "@noverax/nexus/define"

const users = defineGroup({
  prefix: "users",
  endpoints: {
    // endpoint<ResponseType, VariablesType>()
    getAll: endpoint<UserListResponse>()((http) => http.get()),

    getById: endpoint<User, { id: number }>()((http) => http.get(":id")),

    create: endpoint<User, CreateUserInput>()((http) => http.post()),

    update: endpoint<User, { id: number } & Partial<CreateUserInput>>()(
      (http) => http.put(":id")
    ),

    delete: endpoint<{ success: boolean }, { id: number }>()(
      (http) => http.del(":id")
    ),
  },
})

// These types flow through the entire chain:
// endpoint → defineGroup → defineApi → Sources → createQueryCaller
// → useQuery/useMutation/caller → call site`

const inferenceCode = `// Full type inference at call site — no manual types needed

// useQuery infers Response type from the Endpoint definition
const { data } = useQuery("api", "users:getAll")
//      ^? { data: User[], total: number } | undefined

// useMutation infers both Response and Variables
const { mutate } = useMutation("api", "users:create")
//      ^? (variables: { name: string, email: string, role?: string }) => void

// caller (non-hook) also infers types
const users = await caller("api")("users:getAll", {})
//    ^? { data: User[], total: number }

// Group:method syntax resolves the correct nested type
const user = await caller("api")("users:getById", { id: 1 })
//    ^? User`

const multiInstanceCode = `// Multiple instances for different backends
import { createQueryCaller } from "@noverax/nexus-query"

// Internal API
export const internal = createQueryCaller<InternalSources>({
  timeout: 5000,
  headers: { "X-Internal": "true" },
})

// External API
export const external = createQueryCaller<ExternalSources>({
  timeout: 15000,
  onError: (error) => Sentry.captureException(error),
})

// Usage — each instance is fully typed independently
const { data } = internal.useQuery("users", "getAll")
const { mutate } = external.useMutation("payments", "charge")`

const directCode = `// Direct mode — same type system, no proxy
import { createCaller } from "@noverax/nexus"
import { sources } from "@/api"

export const direct = createCaller(sources)

// Server Component or Server Action
const users = await direct("api")("users:getAll", {})
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
          description="One createQueryCaller call exports typed hooks for the entire app."
          code={singletonCode}
          learnMoreHref="/docs/advanced/singleton"
          learnMoreLabel="Singleton docs"
        >
          <p className="text-sm text-muted-foreground">
            The generic parameter{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"<Sources>"}</code> carries all
            source, group, endpoint, response, and variable types. Every call site gets full
            autocompletion and type checking.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Source Definition"
          description="Define sources with defineApi and defineGroup functions. Export the sources map and its type."
          code={sourcesCode}
        >
          <p className="text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">Sources</code> type is
            derived from the actual definitions — no need to manually define or sync types.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Method Types"
          description="endpoint<Response, Variables>() is the foundation of the type system."
          code={methodTypeCode}
        >
          <p className="text-sm text-muted-foreground">
            Each endpoint declares its response and variables types. These flow through the chain:
            endpoint → defineGroup → defineApi → Sources → createQueryCaller → call site.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Type Inference"
          description="Full autocompletion and type checking at every call site — no manual types needed."
          code={inferenceCode}
        >
          <p className="text-sm text-muted-foreground">
            TypeScript infers source names, group:method queries, response types, and variable types
            automatically. Errors are caught at compile time.
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
