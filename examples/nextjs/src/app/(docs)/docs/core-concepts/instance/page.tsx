import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const methodsCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string; email: string }

export class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  // GET /users — variables become search params
  getAll: Method<User[], { page?: number; limit?: number }> = ({ get }) => get()

  // GET /users/:id — :id is extracted from variables
  getById: Method<User, { id: number }> = ({ get }) => get(":id")

  // POST /users — variables become JSON body
  create: Method<User, { name: string; email: string }> = ({ post }) => post()

  // PUT /users/:id — :id extracted, rest becomes JSON body
  update: Method<User, { id: number; name: string }> = ({ put }) => put(":id")

  // PATCH /users/:id — partial update
  patch: Method<User, { id: number; email: string }> = ({ patch }) => patch(":id")

  // DELETE /users/:id
  remove: Method<null, { id: number }> = ({ del }) => del(":id")
}`

const methodSignaturesCode = `// GET, DELETE, HEAD — accept (url?, options?)
// Variables are sent as search params automatically
({ get }) => get("/search")
// → GET /users/search?page=1&limit=10

// POST, PUT, PATCH — accept (url?, variables?, options?)
// Variables are sent as JSON body automatically
({ post }) => post()
// → POST /users  body: { name: "Jane", email: "jane@test.com" }

// You can also pass a sub-path
({ post }) => post("bulk")
// → POST /users/bulk`

const pathParamsCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type Comment = { id: number; body: string; author: string }

export class Comments extends RequestGroup {
  constructor() {
    super({ prefix: "posts" })
  }

  // Multiple path params: /posts/:postId/comments/:commentId
  getOne: Method<Comment, { postId: number; commentId: number }> = ({ get }) =>
    get(":postId/comments/:commentId")

  // Path params + body: :postId is extracted, rest becomes body
  create: Method<Comment, { postId: number; body: string }> = ({ post }) =>
    post(":postId/comments")
}

// Usage:
// request("api")("comments:getOne", { postId: 5, commentId: 12 })
// → GET /posts/5/comments/12

// mutate({ postId: 5, body: "Great post!" })
// → POST /posts/5/comments  body: { body: "Great post!" }`

const responseTypeCode = `// MethodKyResponse<T> — what every method returns
type MethodKyResponse<T> = {
  status: number   // HTTP status code (200, 201, 404, ...)
  headers: Headers // Response headers
  data: T          // Parsed response body, typed as T
}

// By default, Nexus returns just the data (unwrapped)
const users = await directRequest("api")("users:getAll")
//    ^? User[]

// With rawData: true, you get the full response object
const response = await directRequest("api", { rawData: true })("users:getAll")
//    ^? { status: number; headers: Headers; data: User[] }`

const baseOptionsCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      // Required: your backend URL
      baseURL: process.env.API_URL ?? "http://localhost:4000",

      // Response format (default: "json")
      responseType: "json",

      // Default data merged into every POST/PUT/PATCH body
      defaultData: { locale: "en" },

      // Default params merged into every GET request
      defaultQueryParams: { format: "full" },

      // ky options — timeout, retry, headers, etc.
      timeout: 30_000,
      retry: { limit: 2, statusCodes: [408, 429, 502, 503] },
      headers: { "X-Client": "nexus" },

      // Cancel duplicate in-flight requests (default: false)
      requestAbort: true,

      // Lifecycle hooks
      onRequest: (info) => { /* modify before send */ },
      onResponse: (info, response) => { /* transform response */ },
      onError: (info, error) => { /* handle errors globally */ },

      // Groups
      groups,
    })
  }
}`

export const metadata = docsMetadata("Instance & Methods", "How Nexus wraps HTTP calls with typed methods, automatic serialization, and path parameter extraction.")

export default async function InstancePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Instance & Methods"
        description="How Nexus wraps HTTP calls with typed methods, automatic serialization, and path parameter extraction."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Under the hood, Nexus uses an <InlineCode>Instance</InlineCode> class that wraps the{" "}
          <InlineCode>ky</InlineCode> HTTP client. You never create an{" "}
          <InlineCode>Instance</InlineCode> directly — it is created internally when a request is
          executed. What you interact with are the <strong>typed HTTP methods</strong> that Instance
          provides to your <InlineCode>RequestGroup</InlineCode> method definitions.
        </p>

        <h2 id="http-methods">HTTP Methods</h2>

        <p>
          Every method in a <InlineCode>RequestGroup</InlineCode> receives a{" "}
          <InlineCode>methods</InlineCode> object with six HTTP helpers:{" "}
          <InlineCode>get</InlineCode>, <InlineCode>post</InlineCode>, <InlineCode>put</InlineCode>,{" "}
          <InlineCode>patch</InlineCode>, <InlineCode>del</InlineCode>, and{" "}
          <InlineCode>head</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={methodsCode} filename="api/users.ts" />

      <Prose>
        <h2 id="method-signatures">Method Signatures</h2>

        <p>The key difference between methods is how they handle variables:</p>

        <ul>
          <li>
            <strong>GET, DELETE, HEAD</strong> — variables are automatically encoded as search
            params (<InlineCode>?page=1&limit=10</InlineCode>).
          </li>
          <li>
            <strong>POST, PUT, PATCH</strong> — variables are automatically sent as a JSON body.
          </li>
        </ul>
      </Prose>

      <CodeBlock code={methodSignaturesCode} language="typescript" />

      <Callout variant="tip" title="Automatic serialization">
        <p>
          You never need to call <InlineCode>JSON.stringify</InlineCode> or build query strings
          manually. Nexus handles encoding based on the HTTP method. You can customize this with{" "}
          <InlineCode>bodyEncoder</InlineCode> and <InlineCode>searchParamsEncoder</InlineCode> in
          BaseOptions.
        </p>
      </Callout>

      <Prose>
        <h2 id="path-parameters">Path Parameters</h2>

        <p>
          Use the <InlineCode>{":param"}</InlineCode> syntax in URLs to define path parameters.
          Nexus extracts matching keys from variables, inserts them into the URL, and sends the
          remaining variables as body or search params:
        </p>
      </Prose>

      <CodeBlock code={pathParamsCode} filename="api/comments.ts" />

      <Callout variant="info" title="Powered by path-to-regexp">
        <p>
          Path parameter extraction uses the same <InlineCode>path-to-regexp</InlineCode> library
          that Express and Next.js use. Any valid pattern like <InlineCode>{":id"}</InlineCode> or{" "}
          <InlineCode>{":slug"}</InlineCode> works out of the box.
        </p>
      </Callout>

      <Prose>
        <h2 id="response-type">Response Type</h2>

        <p>
          Every HTTP method returns a <InlineCode>{"MethodKyResponse<T>"}</InlineCode> internally.
          By default, Nexus unwraps this and returns just the <InlineCode>data</InlineCode>{" "}
          property. If you need the full response (status code, headers), use the{" "}
          <InlineCode>rawData</InlineCode> option:
        </p>
      </Prose>

      <CodeBlock code={responseTypeCode} language="typescript" />

      <Prose>
        <h2 id="base-options">BaseOptions</h2>

        <p>
          The <InlineCode>Request</InlineCode> constructor accepts{" "}
          <InlineCode>BaseOptions</InlineCode> — a comprehensive set of options that configure the
          underlying Instance. These options apply to every method in every group under this
          Request:
        </p>
      </Prose>

      <CodeBlock code={baseOptionsCode} filename="api/index.ts" />

      <Callout variant="warning" title="defaultData and defaultQueryParams">
        <p>
          <InlineCode>defaultData</InlineCode> is merged into every POST/PUT/PATCH body, and{" "}
          <InlineCode>defaultQueryParams</InlineCode> is merged into every GET request. Use these
          for values like locale, API version, or tenant ID that should be sent with every request.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/core-concepts/request">Request & RequestGroup</Link> — how to define
            and compose API sources
          </li>
          <li>
            <Link href="/docs/core-concepts/type-safety">Type Safety</Link> — how types flow from
            method definitions to your components
          </li>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling</Link> — handling HTTP
            errors and the HTTPError class
          </li>
        </ul>
      </Prose>
    </div>
  )
}
