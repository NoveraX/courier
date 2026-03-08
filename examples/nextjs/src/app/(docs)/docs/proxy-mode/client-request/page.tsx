import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const signatureCode = `import { createClientRequest } from "@noverax/nexus"
import type { Sources } from "@/api"

// createClientRequest<T>(defaults?) returns CommonRequest<T>
const request = createClientRequest<Sources>()

// Curried usage:
const result = await request("sourceName")("group:method", variables)
//                           ^? source      ^? query string  ^? data`

const defaultsCode = `type ClientRequestDefaults = {
  // API route path — default: "request" → POST /api/request
  requestPage?: string

  // Request timeout in milliseconds
  timeout?: number

  // Cookie behavior — default: "include"
  credentials?: RequestCredentials

  // Extra headers sent with every proxy request
  headers?: Record<string, string>

  // Called on every failed request
  onError?: (error: HTTPError) => void | Promise<void>

  // Called on every successful request
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const setupCode = `// lib/request.ts
import { createClientRequest } from "@noverax/nexus"
import type { Sources } from "@/api"

export const request = createClientRequest<Sources>({
  timeout: 30_000,
  credentials: "include",
  headers: {
    "x-app-version": "1.0.0",
  },
  onError: (error) => {
    if (error.status === 401) {
      window.location.href = "/login"
    }
  },
})`

const queryStringCode = `// With a group — "groupName:methodName"
await request("myApi")("users:getAll")
await request("myApi")("users:getById", { id: 5 })
await request("myApi")("posts:create", { title: "Hello", body: "World" })

// Without a group — "methodName" (methods on the Request class itself)
await request("myApi")("healthCheck")`

const bodyCompositionCode = `// JSON body (default for objects)
// Sends: POST /api/request
// Body:  { source: "myApi", group: "users", query: "create", variables: { name: "Jane" } }
await request("myApi")("users:create", { name: "Jane" })

// FormData body (when variables is FormData)
// Sends: POST /api/request (multipart/form-data)
// Body:  _source=myApi, _group=users, _query=create, _options={...}, name=Jane, avatar=File
const formData = new FormData()
formData.append("name", "Jane")
formData.append("avatar", fileInput.files[0])
await request("myApi")("users:create", formData)`

const callbacksCode = `const request = createClientRequest<Sources>({
  onSuccess: (data) => {
    // Called after every successful response
    console.log("Response:", data)
  },
  onError: (error) => {
    // Called after every failed response
    // error.status  — HTTP status code
    // error.data    — parsed response body
    // error.headers — response headers

    if (error.status === 401) {
      window.location.href = "/login"
    }

    if (error.status === 429) {
      toast.error("Too many requests. Please wait.")
    }
  },
})`

const envOverrideCode = `# .env.local
# Changes the proxy endpoint from /api/request to /api/my-proxy
NEXT_PUBLIC_REQUEST_PAGE=my-proxy

# The client will now POST to /api/my-proxy instead of /api/request`

const optionsCode = `// Per-request options (second argument of the source selector)
const fetchUser = request("myApi", {
  timeout: 5000,
  signal: abortController.signal,
  cache: "no-store",
})

const user = await fetchUser("users:getById", { id: 5 })`

export default async function ClientRequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="createClientRequest"
        description="The browser-side factory that sends typed requests through your Next.js proxy route."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          <InlineCode>createClientRequest</InlineCode> creates a curried function that POSTs to your
          Next.js API route. It is the primary way to make requests from client components in proxy
          mode.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} filename="lib/request.ts" />

      <Prose>
        <p>
          The generic parameter <InlineCode>{"Sources"}</InlineCode> provides full type inference
          for source names, group names, method names, variables, and response types.
        </p>

        <h2 id="defaults">Defaults</h2>

        <p>
          Pass a <InlineCode>ClientRequestDefaults</InlineCode> object to configure global behavior
          for all requests created by this factory:
        </p>
      </Prose>

      <CodeBlock code={defaultsCode} language="typescript" />

      <Prose>
        <h2 id="setup">Complete setup</h2>

        <p>
          A typical setup creates a single request instance and exports it for use across all client
          components:
        </p>
      </Prose>

      <CodeBlock code={setupCode} filename="lib/request.ts" />

      <Callout variant="tip" title="One instance per app">
        <p>
          Create <InlineCode>createClientRequest</InlineCode> once in a shared module. All client
          components import from the same file, ensuring consistent defaults and callbacks.
        </p>
      </Callout>

      <Prose>
        <h2 id="query-string">Query string convention</h2>

        <p>The query string tells Nexus which method to call. It supports two formats:</p>

        <ul>
          <li>
            <InlineCode>{`"group:method"`}</InlineCode> — calls a method on a{" "}
            <InlineCode>RequestGroup</InlineCode> (most common)
          </li>
          <li>
            <InlineCode>{`"method"`}</InlineCode> — calls a method directly on the{" "}
            <InlineCode>Request</InlineCode> class (no group)
          </li>
        </ul>
      </Prose>

      <CodeBlock code={queryStringCode} filename="Usage examples" />

      <Prose>
        <h2 id="body-composition">Body composition</h2>

        <p>How the request body is built depends on the type of variables you pass:</p>
      </Prose>

      <CodeBlock code={bodyCompositionCode} filename="JSON vs FormData" />

      <Callout variant="info" title="FormData meta fields">
        <p>
          When sending FormData, Nexus appends metadata as special fields:{" "}
          <InlineCode>_source</InlineCode>, <InlineCode>_group</InlineCode>,{" "}
          <InlineCode>_query</InlineCode>, and <InlineCode>_options</InlineCode>. Your actual
          variables are appended alongside them. The API route strips these meta fields before
          passing variables to your method.
        </p>
      </Callout>

      <Prose>
        <h2 id="per-request-options">Per-request options</h2>

        <p>
          You can pass options to the source selector (the first curried call) to override defaults
          for a specific request chain:
        </p>
      </Prose>

      <CodeBlock code={optionsCode} filename="Per-request options" />

      <Prose>
        <h2 id="callbacks">Global callbacks</h2>

        <p>
          The <InlineCode>onError</InlineCode> and <InlineCode>onSuccess</InlineCode> callbacks run
          for every request made by this factory. Use them for cross-cutting concerns like
          authentication redirects or logging:
        </p>
      </Prose>

      <CodeBlock code={callbacksCode} filename="Global error handling" />

      <Prose>
        <h2 id="custom-endpoint">Custom proxy endpoint</h2>

        <p>
          By default, requests are sent to <InlineCode>/api/request</InlineCode>. You can change
          this in two ways:
        </p>

        <ul>
          <li>
            Pass <InlineCode>requestPage</InlineCode> in the defaults object
          </li>
          <li>
            Set the <InlineCode>NEXT_PUBLIC_REQUEST_PAGE</InlineCode> environment variable
          </li>
        </ul>
      </Prose>

      <CodeBlock code={envOverrideCode} language="bash" filename=".env.local" />

      <Callout variant="warning" title="Match your API route">
        <p>
          If you change the proxy endpoint, make sure your API route file matches. For example,{" "}
          <InlineCode>NEXT_PUBLIC_REQUEST_PAGE=my-proxy</InlineCode> requires the route handler at{" "}
          <InlineCode>app/api/my-proxy/route.ts</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/api-route">API Route Handler</Link> — set up the
            server-side endpoint
          </li>
          <li>
            <Link href="/docs/proxy-mode/upload">File Upload</Link> — upload files with progress
            tracking
          </li>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode Overview</Link> — architecture and
            security model
          </li>
        </ul>
      </Prose>
    </div>
  )
}
