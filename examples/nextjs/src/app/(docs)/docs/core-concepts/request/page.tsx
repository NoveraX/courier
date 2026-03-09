import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const requestClassCode = `import { Datasource } from "@noverax/nexus/datasource"

// A simple Request without groups — for flat APIs with few endpoints
class SimpleApi extends Datasource {
  constructor() {
    super({
      baseURL: "https://api.example.com",
    })
  }
}`

const requestGroupCode = `import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type User = { id: number; name: string; email: string }
type CreateUserVars = { name: string; email: string }

export class Users extends EndpointGroup {
  constructor() {
    // The prefix becomes the URL path segment: /users
    super({ prefix: "users" })
  }

  // Endpoint<ResponseType> — no variables needed
  getAll: Endpoint<User[]> = ({ get }) => get()

  // Endpoint<ResponseType, VariablesType> — variables are required
  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id")
  create: Endpoint<User, CreateUserVars> = ({ post }) => post()
  update: Endpoint<User, { id: number; name: string }> = ({ put }) => put(":id")
  remove: Endpoint<null, { id: number }> = ({ del }) => del(":id")
}`

const requestWithGroupsCode = `import { Datasource } from "@noverax/nexus/datasource"
import { Users } from "./users"
import { Posts } from "./posts"
import { Comments } from "./comments"

const groups = {
  users: new Users(),
  posts: new Posts(),
  comments: new Comments(),
}

class BlogApi extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
    })
  }
}

export const sources = { blogApi: new BlogApi() }
export type Sources = typeof sources`

const queryStringCode = `// With groups — use "group:method" syntax
const { data } = useQuery("blogApi", "users:getAll")
const { data } = useQuery("blogApi", "posts:getBySlug", { variables: { slug: "hello" } })

// Without groups — just the method name
const { data } = useQuery("simpleApi", "getHealth")`

const groupOptionsCode = `import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type Product = { id: number; name: string; price: number }

export class Products extends EndpointGroup {
  constructor() {
    super({
      // URL prefix — appended to the base URL
      prefix: "api/v2/products",

      // pathOptions — dynamically inject headers/cookies per request
      pathOptions: (req) => ({
        Authorization: req?.headers.get("authorization") ?? undefined,
      }),
    })
  }

  list: Endpoint<Product[]> = ({ get }) => get()
  getById: Endpoint<Product, { id: number }> = ({ get }) => get(":id")
}`

export const metadata = docsMetadata(
  "Request & RequestGroup",
  "Define your API structure with typed classes that serve as the single source of truth for all requests."
)

export default async function RequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Request & RequestGroup"
        description="Define your API structure with typed classes that serve as the single source of truth for all requests."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Every API in Nexus is described by two building blocks: <InlineCode>Request</InlineCode>{" "}
          and <InlineCode>RequestGroup</InlineCode>. Together they define <em>what</em> your backend
          exposes and <em>how</em> each endpoint is called — with full type information, no code
          generation required.
        </p>

        <ul>
          <li>
            <strong>Request</strong> — represents an entire backend service. It holds the base URL,
            shared options, and a map of groups.
          </li>
          <li>
            <strong>RequestGroup</strong> — organizes related endpoints under a common URL prefix.
            Each method inside the group declares its response and variables types.
          </li>
        </ul>

        <h2 id="request-class">The Request Class</h2>

        <p>
          <InlineCode>Request</InlineCode> is the top-level container for an API source. At its
          simplest, it only needs a <InlineCode>baseURL</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={requestClassCode} filename="api/sources.ts" />

      <Prose>
        <p>
          In practice, most APIs have multiple resource types, so you will pair{" "}
          <InlineCode>Request</InlineCode> with one or more <InlineCode>RequestGroup</InlineCode>{" "}
          instances. The generic parameter <InlineCode>{"Request<typeof groups>"}</InlineCode> tells
          TypeScript exactly which groups and methods are available.
        </p>

        <h2 id="request-group">The RequestGroup Class</h2>

        <p>
          A <InlineCode>RequestGroup</InlineCode> is a class where each property is a typed API
          method. The <InlineCode>prefix</InlineCode> option sets the URL path segment that is
          appended to the base URL for every method in the group.
        </p>
      </Prose>

      <CodeBlock code={requestGroupCode} filename="api/users.ts" />

      <Callout variant="info" title="The Method type">
        <p>
          <InlineCode>{"Endpoint<R, V>"}</InlineCode> is a generic type where{" "}
          <InlineCode>R</InlineCode> is the response type and <InlineCode>V</InlineCode> is the
          variables type. When <InlineCode>V</InlineCode> is omitted (defaults to{" "}
          <InlineCode>undefined</InlineCode>), no variables are required to call the method.
        </p>
      </Callout>

      <Prose>
        <p>
          Each method receives a destructured <InlineCode>methods</InlineCode> object with HTTP
          helpers (<InlineCode>get</InlineCode>, <InlineCode>post</InlineCode>,{" "}
          <InlineCode>put</InlineCode>, <InlineCode>patch</InlineCode>, <InlineCode>del</InlineCode>
          , <InlineCode>head</InlineCode>) and optionally the <InlineCode>variables</InlineCode>{" "}
          passed by the caller. The return value is a{" "}
          <InlineCode>{"MethodKyResponse<R>"}</InlineCode> with <InlineCode>status</InlineCode>,{" "}
          <InlineCode>headers</InlineCode>, and typed <InlineCode>data</InlineCode>.
        </p>

        <h2 id="composing">Composing Request with Groups</h2>

        <p>
          Pass a <InlineCode>groups</InlineCode> object to your <InlineCode>Request</InlineCode>{" "}
          constructor. TypeScript infers the full shape of your API from this object:
        </p>
      </Prose>

      <CodeBlock code={requestWithGroupsCode} filename="api/index.ts" />

      <Prose>
        <h2 id="query-string">The Query String Convention</h2>

        <p>
          When calling a method, you reference it with a string. If the method belongs to a group,
          use the <InlineCode>{'"group:method"'}</InlineCode> format. If the Request has no groups,
          use the method name directly:
        </p>
      </Prose>

      <CodeBlock code={queryStringCode} language="typescript" />

      <Callout variant="tip" title="Autocomplete works">
        <p>
          TypeScript narrows the query string to a union of valid{" "}
          <InlineCode>{'"group:method"'}</InlineCode> combinations. You get autocomplete in your
          editor and a compile-time error if you mistype a method name.
        </p>
      </Callout>

      <Prose>
        <h2 id="group-options">RequestGroup Options</h2>

        <p>
          <InlineCode>RequestGroupOptions</InlineCode> accepts two properties:
        </p>

        <ul>
          <li>
            <InlineCode>prefix</InlineCode> — URL path segment appended to the base URL (e.g.{" "}
            <InlineCode>{'"users"'}</InlineCode>, <InlineCode>{'"api/v2/products"'}</InlineCode>).
          </li>
          <li>
            <InlineCode>pathOptions</InlineCode> — a function that returns dynamic key-value pairs
            (typically headers or cookies) to merge into each request.
          </li>
        </ul>
      </Prose>

      <CodeBlock code={groupOptionsCode} filename="api/products.ts" />

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/core-concepts/instance">Instance & Methods</Link> — how the HTTP
            methods inside your groups actually work
          </li>
          <li>
            <Link href="/docs/core-concepts/type-safety">Type Safety</Link> — how Nexus infers types
            end-to-end without codegen
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — handling HTTP
            errors with typed error data
          </li>
        </ul>
      </Prose>
    </div>
  )
}
