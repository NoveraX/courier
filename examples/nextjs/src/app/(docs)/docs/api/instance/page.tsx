import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const classCode = `class Instance {
  constructor(options?: BaseOptions, context?: Context)

  methodsInstance(
    options?: GenerateMethodOptions,
    datasourceOptions?: MethodsInstanceDatasourceOptions,
  ): MethodsInstance
}`

const methodsInstanceTypeCode = `type MethodsInstance = {
  get: <T>(url?: string, variables?: Record<string, unknown>, options?: MethodOptions) => Promise<MethodKyResponse<T>>
  post: <T>(url?: string, variables?: Record<string, unknown>, options?: MethodOptions) => Promise<MethodKyResponse<T>>
  put: <T>(url?: string, variables?: Record<string, unknown>, options?: MethodOptions) => Promise<MethodKyResponse<T>>
  patch: <T>(url?: string, variables?: Record<string, unknown>, options?: MethodOptions) => Promise<MethodKyResponse<T>>
  del: <T>(url?: string, variables?: Record<string, unknown>, options?: MethodOptions) => Promise<MethodKyResponse<T>>
  head: <T>(url?: string, options?: MethodOptions) => Promise<MethodKyResponse<T>>
}`

const methodKyResponseCode = `type MethodKyResponse<T = unknown> = {
  status: number    // HTTP status code
  headers: Headers  // Response headers
  data: T           // Parsed response body
}`

const generateMethodOptionsCode = `type GenerateMethodOptions = SimpleOptions & {
  // Variables to inject into methods (from request body)
  vars?: FormData | Record<string, unknown>

  // Return ReadableStream instead of parsed body
  stream?: boolean
}`

const methodParametersCode = `// For get, post, put, patch, del:
type MethodParameters = [
  url?: string,
  variables?: Record<string, unknown>,
  options?: MethodOptions,
]

// For head (no variables):
type MethodParameters = [
  url?: string,
  options?: MethodOptions,
]`

const methodsUsageCode = `// Methods receive MethodsInstance — the object returned by methodsInstance()
// This is how you define request methods on your sources:

type UserMethods = {
  // GET request — variables become search params
  getAll: Method<User[]>
  getById: Method<User, { id: string }>

  // POST request — variables become JSON body
  create: Method<User, { name: string; email: string }>

  // PUT request
  update: Method<User, { id: string; name: string }>

  // DELETE request
  delete: Method<void, { id: string }>
}

// Implementation:
const getAll = (methods: MethodsInstance) =>
  methods.get<User[]>()

const getById = (methods: MethodsInstance, { id }: { id: string }) =>
  methods.get<User>("/:id", { id })

const create = (methods: MethodsInstance, data: { name: string; email: string }) =>
  methods.post<User>("", data)

const update = (methods: MethodsInstance, { id, ...data }: { id: string; name: string }) =>
  methods.put<User>("/:id", { id, ...data })

const remove = (methods: MethodsInstance, { id }: { id: string }) =>
  methods.del<void>("/:id", { id })`

const pathParamsCode = `// :param syntax in URLs is replaced with matching variable values
methods.get("/:id", { id: "123" })
// → GET /users/123

methods.get("/:userId/posts/:postId", { userId: "1", postId: "42" })
// → GET /users/1/posts/42

// Remaining variables (not matching :params) become search params for GET/DEL
methods.get("/:id", { id: "123", include: "posts" })
// → GET /users/123?include=posts

// For POST/PUT/PATCH, remaining variables go into the JSON body
methods.put("/:id", { id: "123", name: "Alice" })
// → PUT /users/123  body: { name: "Alice" }`

const variableHandlingCode = `// GET & DEL: all variables become search parameters
methods.get("", { page: "1", limit: "10" })
// → GET /users?page=1&limit=10

// POST, PUT, PATCH: variables become JSON body
methods.post("", { name: "Alice", email: "alice@example.com" })
// → POST /users  body: { name: "Alice", email: "alice@example.com" }

// FormData is detected automatically
const formData = new FormData()
formData.append("file", file)
methods.post("/upload", formData)
// → POST /users/upload  body: FormData (multipart)

// HEAD: no variables allowed, only URL and options
methods.head("/health")`

const streamCode = `// When stream: true is set in GenerateMethodOptions,
// the response data is a ReadableStream instead of parsed JSON/text
const instance = new Instance({ baseURL: "https://api.example.com" })

const methods = instance.methodsInstance({ stream: true })
const response = await methods.get("/events")
// response.data is ReadableStream`

const contextCode = `type Context = {
  req?: NextRequest   // Incoming Next.js request
  res?: NextResponse  // Outgoing Next.js response
  headers?: Headers   // Request headers to forward
}

// Context is passed to the Instance constructor
// and used by pathOptions to access request metadata
const instance = new Instance(options, {
  req: nextRequest,
  headers: await headers(),
})`

const errorHandlingCode = `// Instance wraps ky errors into Nexus HTTPError
try {
  const response = await methods.get("/:id", { id: "999" })
} catch (error) {
  // ky HTTPError → Nexus HTTPError with { status, headers, data }
  // Network errors → HTTPError with status: 0
}

// Error responses (4xx, 5xx) are parsed and included in error.data
// 204 No Content → returns null as data`

export default async function InstancePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Instance"
        description="HTTP client wrapper around ky that generates typed HTTP methods (get, post, put, patch, del, head) with automatic URL parameter resolution."
        badge="Class"
      />

      <Prose>
        <h2 id="overview">Overview</h2>
        <p>
          <InlineCode>Instance</InlineCode> is the low-level HTTP client at the core of Nexus. It
          wraps <InlineCode>ky</InlineCode> and provides the{" "}
          <InlineCode>methodsInstance()</InlineCode> method that generates typed HTTP method
          functions. You rarely use <InlineCode>Instance</InlineCode> directly — it&apos;s created
          internally by <InlineCode>createRequest</InlineCode> when processing proxy or direct
          requests.
        </p>
      </Prose>

      <Callout variant="info" title="Internal class">
        <p>
          <InlineCode>Instance</InlineCode> is used internally by Nexus. Understanding it helps with
          writing method definitions and debugging, but you don&apos;t need to instantiate it
          yourself.
        </p>
      </Callout>

      <Prose>
        <h2 id="signature">Signature</h2>
      </Prose>

      <CodeBlock code={classCode} language="typescript" />

      <Prose>
        <h2 id="methods-instance">methodsInstance()</h2>
        <p>
          Returns a <InlineCode>MethodsInstance</InlineCode> object with six HTTP method functions.
          This is the object your method definitions receive as the first argument.
        </p>
      </Prose>

      <CodeBlock code={methodsInstanceTypeCode} language="typescript" />

      <Prose>
        <h3 id="method-response">MethodKyResponse</h3>
        <p>
          Every method returns a <InlineCode>MethodKyResponse</InlineCode> wrapping the status code,
          headers, and parsed data.
        </p>
      </Prose>

      <CodeBlock code={methodKyResponseCode} language="typescript" />

      <Prose>
        <h3 id="generate-method-options">GenerateMethodOptions</h3>
        <p>
          Options passed to <InlineCode>methodsInstance()</InlineCode> that configure how methods
          behave.
        </p>
      </Prose>

      <CodeBlock code={generateMethodOptionsCode} language="typescript" />

      <Prose>
        <h2 id="method-parameters">Method Parameters</h2>
      </Prose>

      <CodeBlock code={methodParametersCode} language="typescript" />

      <Prose>
        <h2 id="defining-methods">Defining Methods</h2>
        <p>
          Your source methods are functions that receive <InlineCode>MethodsInstance</InlineCode> and
          optional variables. They call the appropriate HTTP method and return the response.
        </p>
      </Prose>

      <CodeBlock code={methodsUsageCode} language="typescript" />

      <Prose>
        <h2 id="path-parameters">Path Parameters</h2>
        <p>
          Use <InlineCode>:param</InlineCode> syntax in URLs. Matching variables are substituted,
          and remaining variables are handled based on the HTTP method.
        </p>
      </Prose>

      <CodeBlock code={pathParamsCode} language="typescript" />

      <Prose>
        <h2 id="variable-handling">Variable Handling by Method</h2>
        <p>
          How variables are sent depends on the HTTP method:
        </p>
        <ul>
          <li>
            <InlineCode>GET</InlineCode> / <InlineCode>DEL</InlineCode> — variables become search
            parameters
          </li>
          <li>
            <InlineCode>POST</InlineCode> / <InlineCode>PUT</InlineCode> /{" "}
            <InlineCode>PATCH</InlineCode> — variables become JSON body (or FormData if detected)
          </li>
          <li>
            <InlineCode>HEAD</InlineCode> — no variables, only URL and options
          </li>
        </ul>
      </Prose>

      <CodeBlock code={variableHandlingCode} language="typescript" />

      <Prose>
        <h2 id="streaming">Streaming</h2>
        <p>
          When <InlineCode>stream: true</InlineCode> is set, the response{" "}
          <InlineCode>data</InlineCode> is a <InlineCode>ReadableStream</InlineCode> instead of
          parsed JSON or text.
        </p>
      </Prose>

      <CodeBlock code={streamCode} language="typescript" />

      <Prose>
        <h2 id="context">Context</h2>
        <p>
          The <InlineCode>Context</InlineCode> object provides access to the incoming Next.js
          request and headers. It&apos;s used by <InlineCode>pathOptions</InlineCode> to resolve
          dynamic URL parameters.
        </p>
      </Prose>

      <CodeBlock code={contextCode} language="typescript" />

      <Prose>
        <h2 id="error-handling">Error Handling</h2>
        <p>
          <InlineCode>Instance</InlineCode> automatically converts <InlineCode>ky</InlineCode>{" "}
          errors and network errors into Nexus <InlineCode>HTTPError</InlineCode> objects.
        </p>
      </Prose>

      <CodeBlock code={errorHandlingCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/core-concepts/instance">Instance & Methods Guide</Link> — in-depth
            usage patterns
          </li>
          <li>
            <Link href="/docs/api/request">Request</Link> — defines the BaseOptions that configure
            Instance
          </li>
          <li>
            <Link href="/docs/api/http-error">HTTPError</Link> — error class thrown by Instance
          </li>
          <li>
            <Link href="/docs/api/types">Types</Link> — all type definitions
          </li>
        </ul>
      </Prose>
    </div>
  )
}
