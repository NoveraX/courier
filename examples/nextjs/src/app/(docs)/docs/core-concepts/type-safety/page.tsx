import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const methodTypeCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string; email: string }
type UserList = { data: User[]; total: number }

export class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  // Method<R> — R is the response type, no variables needed
  getAll: Method<UserList> = ({ get }) => get()

  // Method<R, V> — R is the response type, V is the variables type
  getById: Method<User, { id: number }> = ({ get }) => get(":id")

  // V determines what the caller must pass
  create: Method<User, { name: string; email: string }> = ({ post }) => post()
}`

const inferenceChainCode = `// 1. You define the source
export const sources = { myApi: new MyApi() }
export type Sources = typeof sources

// 2. You create a typed client
const { useQuery, useMutation } = createQueryRequest<Sources>()

// 3. TypeScript infers everything at the call site
const { data } = useQuery("myApi", "users:getAll")
//      ^? UserList — inferred from Method<UserList>

const { data } = useQuery("myApi", "users:getById", {
  variables: { id: 5 },
  //           ^? { id: number } — inferred from Method<User, { id: number }>
})

const { mutate } = useMutation("myApi", "users:create")
mutate({ name: "Jane", email: "jane@test.com" })
//      ^? { name: string; email: string } — inferred from Method<User, CreateVars>`

const queryStringTypesCode = `// The first argument is narrowed to valid source names
useQuery("myApi", "users:getAll")     // ✓ — "myApi" exists in Sources
useQuery("unknown", "users:getAll")   // ✗ — Type error: "unknown" is not a valid source

// The second argument is narrowed to valid "group:method" strings
useQuery("myApi", "users:getAll")    // ✓
useQuery("myApi", "users:unknown")   // ✗ — "unknown" is not a method on Users
useQuery("myApi", "fake:getAll")     // ✗ — "fake" is not a group on MyApi

// TypeScript parses the string literal using SplitMethod<T>
type SplitMethod<T extends string> =
  T extends \`\${infer Group}:\${infer Method}\`
    ? { group: Group; method: Method }
    : { group: undefined; method: T }`

const variablesEnforcementCode = `// Method with no variables — V defaults to undefined
getAll: Method<User[]> = ({ get }) => get()

// ✓ No variables needed
useQuery("myApi", "users:getAll")

// ✗ Type error — this method doesn't accept variables
useQuery("myApi", "users:getAll", { variables: { page: 1 } })

// Method with required variables
getById: Method<User, { id: number }> = ({ get }) => get(":id")

// ✗ Type error — variables are required
useQuery("myApi", "users:getById")

// ✗ Type error — wrong variable type
useQuery("myApi", "users:getById", { variables: { id: "abc" } })

// ✓ Correct
useQuery("myApi", "users:getById", { variables: { id: 5 } })`

const wellTypedPatternCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

// 1. Define your domain types explicitly
type Product = {
  id: number
  name: string
  price: number
  category: string
}

type ProductFilters = {
  category?: string
  minPrice?: number
  maxPrice?: number
  page?: number
}

type CreateProductVars = Omit<Product, "id">
type UpdateProductVars = { id: number } & Partial<CreateProductVars>

// 2. Use them in Method generics
export class Products extends RequestGroup {
  constructor() {
    super({ prefix: "products" })
  }

  list: Method<Product[], ProductFilters> = ({ get }) => get()
  getById: Method<Product, { id: number }> = ({ get }) => get(":id")
  create: Method<Product, CreateProductVars> = ({ post }) => post()
  update: Method<Product, UpdateProductVars> = ({ patch }) => patch(":id")
  remove: Method<null, { id: number }> = ({ del }) => del(":id")
}

// 3. Everything flows automatically
// useQuery("api", "products:list", { variables: { category: "shoes" } })
//                                                 ^? ProductFilters
// → data is Product[]`

const methodsInstanceCode = `// The methods object passed to each Method function is typed as MethodsInstance
type MethodsInstance = {
  get: <T>(url?: string, options?: SimpleOptions) => Promise<MethodKyResponse<T>>
  post: <T>(url?: string, variables?: Record<string, unknown>) => Promise<MethodKyResponse<T>>
  put: <T>(url?: string, variables?: Record<string, unknown>) => Promise<MethodKyResponse<T>>
  patch: <T>(url?: string, variables?: Record<string, unknown>) => Promise<MethodKyResponse<T>>
  del: <T>(url?: string, options?: SimpleOptions) => Promise<MethodKyResponse<T>>
  head: <T>(url?: string, options?: SimpleOptions) => Promise<MethodKyResponse<T>>
}

// The response type T in MethodKyResponse<T> is inferred from Method<R, V>
// When you write: getAll: Method<User[]> = ({ get }) => get()
// TypeScript infers T = User[] through the Method generic`

export default async function TypeSafetyPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Type Safety"
        description="How Nexus achieves end-to-end type safety from API definitions to React components — without code generation."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Nexus provides full type safety across the entire request lifecycle: from your API
          definition to the data in your components. There is no code generation, no schema files,
          and no build step. TypeScript classes are the single source of truth, and the type system
          does the rest.
        </p>

        <h2 id="method-generic">The Method Generic</h2>

        <p>
          Type safety starts with the <InlineCode>{"Method<R, V>"}</InlineCode> generic. Every
          method in a <InlineCode>RequestGroup</InlineCode> declares two type parameters:
        </p>

        <ul>
          <li>
            <InlineCode>R</InlineCode> — the response type (what the backend returns)
          </li>
          <li>
            <InlineCode>V</InlineCode> — the variables type (what the caller must pass). Defaults to{" "}
            <InlineCode>undefined</InlineCode>, meaning no variables are needed.
          </li>
        </ul>
      </Prose>

      <CodeBlock code={methodTypeCode} filename="api/users.ts" />

      <Prose>
        <h2 id="inference-chain">The Inference Chain</h2>

        <p>
          Nexus uses TypeScript&apos;s type inference to propagate types through a curried function
          chain. When you call <InlineCode>useQuery</InlineCode> or{" "}
          <InlineCode>directRequest</InlineCode>, TypeScript automatically infers the response type
          and variables type from your method definition:
        </p>
      </Prose>

      <CodeBlock code={inferenceChainCode} language="typescript" />

      <Callout variant="tip" title="No manual type annotations">
        <p>
          You never need to write{" "}
          <InlineCode>{'useQuery<UserList>("myApi", "users:getAll")'}</InlineCode>. The response
          type is inferred automatically from your <InlineCode>{"Method<UserList>"}</InlineCode>{" "}
          definition. This means your types stay in one place and are never duplicated.
        </p>
      </Callout>

      <Prose>
        <h2 id="query-string-types">Query String Literal Types</h2>

        <p>
          The <InlineCode>{'"group:method"'}</InlineCode> query string is not just a runtime
          convention — it is a TypeScript string literal type. This gives you autocomplete and
          compile-time validation for every method call:
        </p>
      </Prose>

      <CodeBlock code={queryStringTypesCode} language="typescript" />

      <Prose>
        <h2 id="variables-enforcement">Variables Enforcement</h2>

        <p>
          TypeScript enforces whether variables are required, optional, or forbidden based on your{" "}
          <InlineCode>{"Method<R, V>"}</InlineCode> definition:
        </p>
      </Prose>

      <CodeBlock code={variablesEnforcementCode} language="typescript" />

      <Callout variant="info" title="Path parameters are included">
        <p>
          If a method uses path parameters like <InlineCode>{":id"}</InlineCode>, those keys must be
          part of the variables type. TypeScript enforces that <InlineCode>id</InlineCode> is
          present in the variables object.
        </p>
      </Callout>

      <Prose>
        <h2 id="well-typed-pattern">Pattern: Well-Typed Methods</h2>

        <p>
          For the best developer experience, define your domain types explicitly and use utility
          types like <InlineCode>Omit</InlineCode> and <InlineCode>Partial</InlineCode> to derive
          variables types:
        </p>
      </Prose>

      <CodeBlock code={wellTypedPatternCode} filename="api/products.ts" />

      <Prose>
        <h2 id="methods-instance-type">The MethodsInstance Type</h2>

        <p>
          The <InlineCode>methods</InlineCode> object passed to each method function is strongly
          typed as <InlineCode>MethodsInstance</InlineCode>. Each HTTP helper is generic — it
          inherits the return type <InlineCode>T</InlineCode> from your{" "}
          <InlineCode>{"Method<R, V>"}</InlineCode> definition:
        </p>
      </Prose>

      <CodeBlock code={methodsInstanceCode} language="typescript" />

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/core-concepts/request">Request & RequestGroup</Link> — define your API
            structure with typed classes
          </li>
          <li>
            <Link href="/docs/core-concepts/instance">Instance & Methods</Link> — how the HTTP
            methods work under the hood
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — typed error data
            with HTTPError
          </li>
        </ul>
      </Prose>
    </div>
  )
}
