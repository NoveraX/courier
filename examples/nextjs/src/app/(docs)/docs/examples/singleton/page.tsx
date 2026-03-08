import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const singletonCode = `// lib/request.ts — Single typed instance for the entire app
import type { MethodsType } from "@/api"
import { createQueryRequest } from "@noverax/nexus/query"

export const { useQuery, useMutation, request } =
  createQueryRequest<MethodsType>()

// MethodsType carries full type information:
// - Source names (keys)
// - Group names and method names per source
// - Response types and variable types per method`

const sourcesCode = `// api/index.ts — Define and export all sources
import { Request } from "@noverax/nexus/RequestClass"

const groups = {
  users: new Users(),   // Users group with CRUD methods
  posts: new Posts(),   // Posts group
  files: new Files(),   // File upload methods
}

class MockApi extends Request<typeof groups> {
  constructor() {
    super({ baseURL: "http://localhost:4000", groups })
  }
}

export const methods = { mockApi: new MockApi() }
export type MethodsType = typeof methods`

const methodTypeCode = `// How Method<Response, Variables> drives the type system
import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  // Method<ResponseType, VariablesType>
  getAll: Method<UserListResponse, Record<string, never>> =
    ({ get }) => get()

  getById: Method<User, { id: number }> =
    ({ get }) => get(":id")

  create: Method<User, CreateUserInput> =
    ({ post }) => post()

  update: Method<User, { id: number } & Partial<CreateUserInput>> =
    ({ put }) => put(":id")

  delete: Method<{ success: boolean }, { id: number }> =
    ({ del }) => del(":id")
}

// These types flow through the entire chain:
// Method definition → Request class → MethodsType → createQueryRequest
// → useQuery/useMutation/request → call site`

const inferenceCode = `// Full type inference at call site — no manual types needed

// useQuery infers Response type from the Method definition
const { data } = useQuery("mockApi", "users:getAll")
//      ^? { data: User[], total: number } | undefined

// useMutation infers both Response and Variables
const { mutate } = useMutation("mockApi", "users:create")
//      ^? (variables: { name: string, email: string, role?: string }) => void

// request (non-hook) also infers types
const users = await request("mockApi")("users:getAll", {})
//    ^? { data: User[], total: number }

// Group:method syntax resolves the correct nested type
const user = await request("mockApi")("users:getById", { id: 1 })
//    ^? User`

const multiInstanceCode = `// Multiple instances for different backends
import { createQueryRequest } from "@noverax/nexus/query"

// Internal API
export const internal = createQueryRequest<InternalMethods>({
  timeout: 5000,
  headers: { "X-Internal": "true" },
})

// External API
export const external = createQueryRequest<ExternalMethods>({
  timeout: 15000,
  onError: (error) => Sentry.captureException(error),
})

// Usage — each instance is fully typed independently
const { data } = internal.useQuery("users", "getAll")
const { mutate } = external.useMutation("payments", "charge")`

const directCode = `// Direct mode — same type system, no proxy
import { createDirectRequest } from "@noverax/nexus/direct"
import { methods } from "@/api"

export const direct = createDirectRequest(methods)

// Server Component or Server Action
const users = await direct("mockApi")("users:getAll", {})
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
      />

      <div className="space-y-8">
        <ExampleBlock
          title="The Singleton Pattern"
          description="One createQueryRequest call exports typed hooks for the entire app."
          code={singletonCode}
          learnMoreHref="/docs/advanced/singleton"
          learnMoreLabel="Singleton docs"
        >
          <p className="text-sm text-muted-foreground">
            The generic parameter{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"<MethodsType>"}</code> carries
            all source, group, method, response, and variable types. Every call site gets full
            autocompletion and type checking.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Source Definition"
          description="Define sources with Request and RequestGroup classes. Export the methods map and its type."
          code={sourcesCode}
        >
          <p className="text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">MethodsType</code> is derived
            from the actual instances — no need to manually define or sync types.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Method Types"
          description="Method<Response, Variables> is the foundation of the type system."
          code={methodTypeCode}
        >
          <p className="text-sm text-muted-foreground">
            Each method declares its response and variables types. These flow through the chain:
            Method → RequestGroup → Request → MethodsType → createQueryRequest → call site.
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
          description="createDirectRequest uses the same type system for server-side usage."
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
