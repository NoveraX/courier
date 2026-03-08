import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const classCode = `class HTTPError<R = unknown> extends Error {
  status: number
  headers: Headers
  data: R

  constructor(response: MethodKyResponse<R>)
}`

const guardCode = `function isHTTPError<R = unknown>(error: unknown): error is HTTPError<R>`

const propertiesCode = `// HTTPError properties:
error.name       // "HTTPError"
error.message    // "HTTP {status}" (e.g., "HTTP 404")
error.status     // HTTP status code (e.g., 404)
error.headers    // Response headers (Headers object)
error.data       // Parsed response body (typed as R)`

const basicUsageCode = `import { isHTTPError } from "@noverax/nexus"

try {
  const user = await request("api")("users:getById", { id: "999" })
} catch (error) {
  if (isHTTPError(error)) {
    console.error(\`HTTP \${error.status}:\`, error.data)
    // error.status  → 404
    // error.headers → Headers { content-type: "application/json" }
    // error.data    → { message: "User not found" }
  }
}`

const typedErrorCode = `// Type the error data for better inference
type ErrorResponse = {
  success: false
  message: string
  code?: string
}

try {
  await request("api")("users:getById", { id: "999" })
} catch (error) {
  if (isHTTPError<ErrorResponse>(error)) {
    // error.data is typed as ErrorResponse
    console.error(error.data.message)  // "User not found"
    console.error(error.data.code)     // "USER_NOT_FOUND"
  }
}`

const statusCheckCode = `try {
  await request("api")("users:getAll")
} catch (error) {
  if (isHTTPError(error)) {
    switch (error.status) {
      case 400:
        console.error("Bad request:", error.data)
        break
      case 401:
        redirectToLogin()
        break
      case 403:
        showForbiddenMessage()
        break
      case 404:
        showNotFound()
        break
      case 429:
        console.warn("Rate limited, retry later")
        break
      default:
        if (error.status >= 500) {
          console.error("Server error:", error.data)
        }
    }
  }
}`

const globalErrorCode = `// Global error handler via createClientRequest
const request = createClientRequest<Sources>({
  onError: (error) => {
    // Called for every HTTPError across all requests
    if (error.status === 401) {
      // Token expired — redirect to login
      window.location.href = "/login"
    }

    if (error.status >= 500) {
      // Log server errors
      reportError(error)
    }
  },
})`

const hookErrorCode = `// Source-level error hook via Request options
const api = new Request({
  baseURL: process.env.API_URL,
  onError: (info, error) => {
    console.error(
      \`[\${info.source}:\${info.group}:\${info.query}] \` +
      \`HTTP \${error.status}: \${JSON.stringify(error.data)}\`
    )
    return undefined
  },
})`

const rawDataErrorCode = `// With rawData mode, error.data contains the raw response data
// (without the wrapper object)
const result = await request("api", { rawData: true })(
  "users:getById",
  { id: "999" },
)
// If the response is { data: { message: "Not found" } },
// rawData mode extracts error.data as { message: "Not found" }`

const networkErrorCode = `// Network errors (DNS failure, connection refused, etc.)
// are converted to HTTPError with status: 0
try {
  await request("api")("users:getAll")
} catch (error) {
  if (isHTTPError(error)) {
    if (error.status === 0) {
      // Network error — no HTTP response received
      console.error("Network error:", error.data)
      // error.data → { success: false, message: "...", code: "ECONNREFUSED" }
    }
  }
}`

const instanceofCode = `// isHTTPError vs instanceof
// Both work, but isHTTPError is the recommended approach:

// ✅ Recommended — works across module boundaries
if (isHTTPError(error)) { ... }

// ⚠️ Works, but may fail across different module instances
if (error instanceof HTTPError) { ... }`

export const metadata = docsMetadata("HTTPError", "Custom error class for HTTP responses with typed data, status code, and headers. Includes the isHTTPError type guard.")

export default async function HTTPErrorPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="HTTPError"
        description="Custom error class for HTTP responses with typed data, status code, and headers. Includes the isHTTPError type guard."
        badge="Class"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock
        code={`import { HTTPError, isHTTPError } from "@noverax/nexus"`}
        language="typescript"
      />

      <Prose>
        <h2 id="class">HTTPError Class</h2>
      </Prose>

      <CodeBlock code={classCode} language="typescript" />

      <Prose>
        <h2 id="properties">Properties</h2>
      </Prose>

      <CodeBlock code={propertiesCode} language="typescript" />

      <Prose>
        <ul>
          <li>
            <InlineCode>status</InlineCode> — the HTTP status code. <InlineCode>0</InlineCode> for
            network errors (DNS failure, connection refused, etc.).
          </li>
          <li>
            <InlineCode>headers</InlineCode> — the response{" "}
            <InlineCode>Headers</InlineCode> object. Empty <InlineCode>Headers</InlineCode> for
            network errors.
          </li>
          <li>
            <InlineCode>data</InlineCode> — the parsed response body. Typed as{" "}
            <InlineCode>R</InlineCode> (generic, defaults to <InlineCode>unknown</InlineCode>).
          </li>
          <li>
            <InlineCode>name</InlineCode> — always{" "}
            <InlineCode>&quot;HTTPError&quot;</InlineCode>.
          </li>
          <li>
            <InlineCode>message</InlineCode> — <InlineCode>&quot;HTTP {"{status}"}&quot;</InlineCode>{" "}
            (e.g., <InlineCode>&quot;HTTP 404&quot;</InlineCode>).
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="is-http-error">isHTTPError</h2>
        <p>Type guard function to check if an error is an HTTPError.</p>
      </Prose>

      <CodeBlock code={guardCode} language="typescript" />

      <Callout variant="tip" title="Prefer isHTTPError over instanceof">
        <p>
          Use <InlineCode>isHTTPError(error)</InlineCode> instead of{" "}
          <InlineCode>error instanceof HTTPError</InlineCode>. The type guard works reliably across
          module boundaries and different package versions.
        </p>
      </Callout>

      <Prose>
        <h2 id="basic-usage">Basic Usage</h2>
      </Prose>

      <CodeBlock code={basicUsageCode} language="typescript" />

      <Prose>
        <h2 id="typed-errors">Typed Error Data</h2>
        <p>
          Pass a type parameter to <InlineCode>isHTTPError</InlineCode> to type the error&apos;s{" "}
          <InlineCode>data</InlineCode> property.
        </p>
      </Prose>

      <CodeBlock code={typedErrorCode} language="typescript" />

      <Prose>
        <h2 id="status-handling">Status Code Handling</h2>
      </Prose>

      <CodeBlock code={statusCheckCode} language="typescript" />

      <Prose>
        <h2 id="global-handler">Global Error Handler</h2>
        <p>
          Use <InlineCode>onError</InlineCode> in <InlineCode>createClientRequest</InlineCode> or{" "}
          <InlineCode>createDirectRequest</InlineCode> to handle errors globally.
        </p>
      </Prose>

      <CodeBlock code={globalErrorCode} language="typescript" />

      <Prose>
        <h2 id="hook-handler">Source-Level Error Hook</h2>
        <p>
          The <InlineCode>onError</InlineCode> hook on <InlineCode>Request</InlineCode> receives
          both the request metadata and the error.
        </p>
      </Prose>

      <CodeBlock code={hookErrorCode} language="typescript" />

      <Prose>
        <h2 id="network-errors">Network Errors</h2>
        <p>
          Network-level errors (DNS failures, connection refused, timeouts at the TCP level) are
          converted to <InlineCode>HTTPError</InlineCode> with{" "}
          <InlineCode>status: 0</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={networkErrorCode} language="typescript" />

      <Prose>
        <h2 id="raw-data">Raw Data Mode</h2>
        <p>
          When using <InlineCode>rawData: true</InlineCode>, the error data is extracted from the
          wrapper object if present.
        </p>
      </Prose>

      <CodeBlock code={rawDataErrorCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/core-concepts/error-handling">Error Handling Guide</Link> — in-depth
            error handling patterns
          </li>
          <li>
            <Link href="/docs/advanced/hooks">Hooks</Link> — lifecycle hooks including onError
          </li>
          <li>
            <Link href="/docs/api/instance">Instance</Link> — where HTTPError is thrown
          </li>
          <li>
            <Link href="/docs/api/types">Types</Link> — MethodKyResponse and related types
          </li>
        </ul>
      </Prose>
    </div>
  )
}
