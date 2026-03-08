import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { createClientRequest } from "@noverax/nexus"

const request = createClientRequest<Sources>(defaults?)`

const defaultsTypeCode = `type ClientRequestDefaults = {
  requestPage?: string
  timeout?: number
  credentials?: RequestCredentials
  headers?: Record<string, string>
  onError?: (error: HTTPError) => void | Promise<void>
  onSuccess?: (data: unknown) => void | Promise<void>
}`

const returnTypeCode = `type CommonRequest<T> = <K extends keyof T>(
  source: K,
  options?: MethodsInstanceOptions,
) => <Q extends MethodGroup<T[K]>>(
  queryRequest: Q,
  variables?: Variables,
) => Promise<Response>`

const basicUsageCode = `import { createClientRequest } from "@noverax/nexus"
import type { Sources } from "@/api/sources"

// Create with defaults
const request = createClientRequest<Sources>({
  timeout: 10000,
  credentials: "include",
})

// Usage: request(source)(query, variables?)
const users = await request("api")("users:getAll")
const user = await request("api")("users:getById", { id: "123" })`

const defaultsUsageCode = `const request = createClientRequest<Sources>({
  // API route name — maps to /api/{requestPage}
  // Default: process.env.NEXT_PUBLIC_REQUEST_PAGE || "request"
  requestPage: "nexus",

  // Request timeout in milliseconds
  timeout: 15000,

  // Cookie/credential handling
  // Default: "include" (always send cookies cross-origin)
  credentials: "include",

  // Default headers for every request
  headers: {
    "X-App-Version": "1.0.0",
    "Accept-Language": "en",
  },

  // Global error handler — called on every HTTPError
  onError: (error) => {
    if (error.status === 401) {
      redirectToLogin()
    }
  },

  // Global success handler — called on every successful response
  onSuccess: (data) => {
    console.log("Request succeeded:", data)
  },
})`

const optionsCode = `// Per-request options via the second argument of source selection
const user = await request("api", {
  timeout: 5000,
  rawData: true,       // Return { status, headers, data } instead of just data
  stream: true,        // Return ReadableStream response
  signal: controller.signal,  // AbortController signal
  cache: "no-store",   // Next.js fetch cache option
})("users:getById", { id: "123" })`

const uploadCode = `// File upload with progress tracking
const result = await request("api", {
  onUploadProgress: (progress) => {
    console.log(\`\${Math.round(progress.percent * 100)}%\`)
    console.log(\`\${progress.transferredBytes} / \${progress.totalBytes}\`)
  },
})("files:upload", formData)`

const formDataCode = `// FormData is automatically detected and sent as multipart/form-data
const formData = new FormData()
formData.append("file", fileInput.files[0])
formData.append("name", "document.pdf")

const result = await request("api")("files:upload", formData)`

const xhrNoteCode = `// When onUploadProgress is set, Nexus uses XMLHttpRequest instead of fetch.
// This provides real network-level progress tracking on both HTTP/1.1 and HTTP/2.
//
// The following options are ignored in XHR mode:
// - cache
// - onDownloadProgress
// - next`

export const metadata = docsMetadata("createClientRequest", "Factory function that creates a typed, curried request function for proxy-mode HTTP calls from the browser.")

export default async function CreateClientRequestPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="createClientRequest"
        description="Factory function that creates a typed, curried request function for proxy-mode HTTP calls from the browser."
        badge="Proxy"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock code={`import { createClientRequest } from "@noverax/nexus"`} language="typescript" />

      <Prose>
        <h2 id="signature">Signature</h2>
        <p>
          <InlineCode>createClientRequest</InlineCode> accepts an optional{" "}
          <InlineCode>ClientRequestDefaults</InlineCode> object and returns a curried{" "}
          <InlineCode>CommonRequest</InlineCode> function. The generic parameter{" "}
          <InlineCode>T</InlineCode> is your <InlineCode>Sources</InlineCode> type — it enables
          full type inference for source names, query names, variables, and response types.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} language="typescript" />

      <Prose>
        <h2 id="parameters">Parameters</h2>
        <h3 id="client-request-defaults">ClientRequestDefaults</h3>
        <p>
          All fields are optional. When omitted, sensible defaults are used.
        </p>
      </Prose>

      <CodeBlock code={defaultsTypeCode} language="typescript" />

      <Prose>
        <ul>
          <li>
            <InlineCode>requestPage</InlineCode> — the API route segment. Requests are sent to{" "}
            <InlineCode>{"/api/{requestPage}"}</InlineCode>. Defaults to{" "}
            <InlineCode>process.env.NEXT_PUBLIC_REQUEST_PAGE</InlineCode> or{" "}
            <InlineCode>&quot;request&quot;</InlineCode>.
          </li>
          <li>
            <InlineCode>timeout</InlineCode> — request timeout in milliseconds. Applied to every
            request unless overridden per-call.
          </li>
          <li>
            <InlineCode>credentials</InlineCode> — cookie handling policy. Defaults to{" "}
            <InlineCode>&quot;include&quot;</InlineCode> (always send cookies cross-origin).
          </li>
          <li>
            <InlineCode>headers</InlineCode> — default headers merged into every request.
          </li>
          <li>
            <InlineCode>onError</InlineCode> — global error handler invoked on every{" "}
            <InlineCode>HTTPError</InlineCode>. Useful for centralized auth redirects or logging.
          </li>
          <li>
            <InlineCode>onSuccess</InlineCode> — global success handler invoked on every successful
            response.
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="return-type">Return Type</h2>
        <p>
          Returns a <InlineCode>CommonRequest&lt;T&gt;</InlineCode> — a curried function with two
          invocation levels:
        </p>
        <ol>
          <li>
            <strong>Source selection</strong> — <InlineCode>request(source, options?)</InlineCode> —
            picks a data source and optional per-request settings.
          </li>
          <li>
            <strong>Query execution</strong> —{" "}
            <InlineCode>request(source)(query, variables?)</InlineCode> — executes a method with
            optional variables.
          </li>
        </ol>
      </Prose>

      <CodeBlock code={returnTypeCode} language="typescript" />

      <Prose>
        <h2 id="usage">Basic Usage</h2>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="lib/request.ts" />

      <Prose>
        <h2 id="defaults">Configuring Defaults</h2>
      </Prose>

      <CodeBlock code={defaultsUsageCode} filename="lib/request.ts" />

      <Prose>
        <h2 id="per-request-options">Per-Request Options</h2>
        <p>
          The second argument to the source selector accepts{" "}
          <InlineCode>MethodsInstanceOptions</InlineCode> — per-call overrides for timeout, caching,
          streaming, abort signals, and more.
        </p>
      </Prose>

      <CodeBlock code={optionsCode} language="typescript" />

      <Prose>
        <h2 id="upload-progress">Upload Progress</h2>
        <p>
          Pass <InlineCode>onUploadProgress</InlineCode> to track file upload progress. Nexus
          automatically detects <InlineCode>FormData</InlineCode> and sends it as{" "}
          <InlineCode>multipart/form-data</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={uploadCode} language="typescript" />

      <CodeBlock code={formDataCode} language="typescript" />

      <Callout variant="info" title="XHR Transport">
        <p>
          When <InlineCode>onUploadProgress</InlineCode> is set, Nexus uses{" "}
          <InlineCode>XMLHttpRequest</InlineCode> instead of <InlineCode>fetch</InlineCode> to
          provide real network-level progress tracking on both HTTP/1.1 and HTTP/2.
        </p>
      </Callout>

      <CodeBlock code={xhrNoteCode} language="typescript" />

      <Prose>
        <h2 id="how-it-works">How It Works</h2>
        <p>
          Under the hood, <InlineCode>createClientRequest</InlineCode> sends a{" "}
          <InlineCode>POST</InlineCode> to your Next.js API route (
          <InlineCode>/api/request</InlineCode> by default) using <InlineCode>ky</InlineCode>. The
          request body contains the source name, group, query, variables, and options — the server
          handler (<InlineCode>apiRoute</InlineCode>) then resolves the method and executes it
          against the backend.
        </p>
      </Prose>

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode Overview</Link> — understand the
            proxy architecture
          </li>
          <li>
            <Link href="/docs/api/api-route">apiRoute</Link> — the server-side handler that
            processes proxy requests
          </li>
          <li>
            <Link href="/docs/api/create-query-request">createQueryRequest</Link> — React Query
            wrapper built on top of createClientRequest
          </li>
          <li>
            <Link href="/docs/api/types">Types</Link> — full type definitions
          </li>
        </ul>
      </Prose>
    </div>
  )
}
