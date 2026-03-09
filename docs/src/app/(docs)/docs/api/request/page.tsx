import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const classCode = `class Datasource<T extends RequestGroupType | undefined = undefined> {
  constructor(public options?: RequestOptions<T>)
}`

const requestOptionsCode = `type RequestOptions<T> = BaseOptions &
  (T extends RequestGroupType ? { groups: T } : {})

type RequestGroupType = Record<string, EndpointGroup>`

const baseOptionsCode = `type BaseOptions = MergeOptions & KyOptions & {
  // Base URL for all requests from this source
  baseURL?: string

  // Response parsing: "json" (default) or "text"
  responseType?: "json" | "text"

  // Default body data merged into every POST/PUT/PATCH request
  defaultData?: Record<string, unknown>

  // Default query parameters merged into every request
  defaultQueryParams?: Record<string, unknown>

  // Additional header names to preserve through the proxy
  allowedHeaders?: string[]

  // Custom body encoder (e.g., for URL-encoded forms)
  bodyEncoder?: (object: Record<string, unknown>) => BodyInit

  // Custom search params encoder
  searchParamsEncoder?: (object: Record<string, unknown>) => SearchParamsOption

  // Custom search params parser (for URL path parameters)
  searchParamsParse?: (string: string) => Record<string, unknown>

  // Enable AbortController for request deduplication
  deduplicate?: boolean

  // Lifecycle hooks
  onRequest?: (info: HookInfo) => HookInfo | undefined | Promise<HookInfo | undefined>
  onResponse?: (
    info: HookInfo,
    response: { status: number; data: unknown },
  ) => { status: number; data: unknown } | undefined | Promise<...>
  onError?: (info: HookInfo, error: HTTPError) => undefined | Promise<undefined>
}`

const basicUsageCode = `import { Datasource } from "@noverax/nexus/datasource"

// Simple source without groups
const api = new Datasource({
  baseURL: "https://api.example.com/v1",
  timeout: 10000,
  headers: {
    Authorization: \`Bearer \${process.env.API_SECRET}\`,
  },
})`

const withGroupsCode = `import { Datasource, EndpointGroup } from "@noverax/nexus/datasource"

// Source with request groups
const api = new Datasource({
  baseURL: process.env.API_URL,
  timeout: 10000,
  responseType: "json",
  groups: {
    users: new EndpointGroup({ prefix: "/users" }),
    posts: new EndpointGroup({ prefix: "/posts" }),
    files: new EndpointGroup({ prefix: "/files" }),
  },
})`

const defaultDataCode = `// defaultData is merged into every POST/PUT/PATCH request body
const api = new Datasource({
  baseURL: process.env.API_URL,
  defaultData: {
    apiKey: process.env.API_KEY,
    version: "v2",
  },
})

// POST /users with body: { apiKey: "...", version: "v2", name: "Alice" }
// The apiKey and version are automatically included`

const defaultQueryParamsCode = `// defaultQueryParams is merged into every request's search parameters
const api = new Datasource({
  baseURL: process.env.API_URL,
  defaultQueryParams: {
    locale: "en",
    format: "json",
  },
})

// GET /users → GET /users?locale=en&format=json
// GET /users?page=1 → GET /users?locale=en&format=json&page=1`

const hooksCode = `const api = new Datasource({
  baseURL: process.env.API_URL,

  // Called before every request — can modify or cancel
  onRequest: (info) => {
    console.log(\`[\${info.source}] \${info.group}:\${info.method}\`)
    return info // return modified info or undefined to continue
  },

  // Called after every successful response
  onResponse: (info, response) => {
    console.log(\`[\${info.source}] \${response.status}\`)
    return response // return modified response or undefined to use original
  },

  // Called on every error
  onError: (info, error) => {
    console.error(\`[\${info.source}] Error \${error.status}:\`, error.data)
    return undefined
  },
})`

const hookInfoCode = `type HookInfo = {
  source: string      // source name (e.g., "api")
  group?: string       // group name (e.g., "users")
  method: string       // method name (e.g., "getById")
  variables?: unknown  // request variables
}`

const encoderCode = `// Custom body encoder — e.g., URL-encoded form data
const api = new Datasource({
  baseURL: process.env.API_URL,
  bodyEncoder: (data) => {
    return new URLSearchParams(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ).toString()
  },
})

// Custom search params encoder
const api2 = new Datasource({
  baseURL: process.env.API_URL,
  searchParamsEncoder: (params) => {
    return new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    )
  },
})`

const abortCode = `// Enable request deduplication via AbortController
const api = new Datasource({
  baseURL: process.env.API_URL,
  deduplicate: true,
})

// If the same request is fired while one is in-flight,
// the previous request is automatically aborted`

const kyOptionsCode = `// All ky options are supported — they pass through to ky.create()
const api = new Datasource({
  baseURL: process.env.API_URL,

  // Timeout per request (ms)
  timeout: 10000,

  // Retry on failure
  retry: { limit: 3, methods: ["get"] },

  // Custom headers
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.API_TOKEN}\`,
  },

  // ky hooks (low-level — prefer onRequest/onResponse/onError above)
  hooks: {
    beforeRequest: [(request) => { /* ... */ }],
    afterResponse: [(request, options, response) => { /* ... */ }],
  },
})`

export const metadata = docsMetadata(
  "Request",
  "Class that defines a data source with base URL, options, lifecycle hooks, and optional request groups."
)

export default async function RequestClassPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Request"
        description="Class that defines a data source with base URL, options, lifecycle hooks, and optional request groups."
        badge="Class"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock code={`import { Datasource } from "@noverax/nexus/datasource"`} language="typescript" />

      <Prose>
        <h2 id="signature">Signature</h2>
      </Prose>

      <CodeBlock code={classCode} language="typescript" />

      <Prose>
        <h2 id="constructor">Constructor</h2>
        <h3 id="request-options">RequestOptions</h3>
        <p>
          <InlineCode>RequestOptions</InlineCode> extends <InlineCode>BaseOptions</InlineCode> and
          adds an optional <InlineCode>groups</InlineCode> property when request groups are used.
        </p>
      </Prose>

      <CodeBlock code={requestOptionsCode} language="typescript" />

      <Prose>
        <h3 id="base-options">BaseOptions</h3>
        <p>
          The core configuration for a data source. Includes Nexus-specific options and all{" "}
          <InlineCode>ky</InlineCode> options (timeout, retry, headers, hooks, etc.).
        </p>
      </Prose>

      <CodeBlock code={baseOptionsCode} language="typescript" />

      <Prose>
        <h2 id="basic-usage">Basic Usage</h2>
        <h3 id="without-groups">Without Groups</h3>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="api/sources.ts" />

      <Prose>
        <h3 id="with-groups">With Groups</h3>
      </Prose>

      <CodeBlock code={withGroupsCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="base-options-detail">Options Reference</h2>
        <h3 id="base-url">baseURL</h3>
        <p>
          Sets the base URL (prefix) for all requests from this source. Maps to{" "}
          <InlineCode>ky</InlineCode>&apos;s <InlineCode>prefixUrl</InlineCode> option.
        </p>

        <h3 id="response-type">responseType</h3>
        <p>
          Controls response parsing. <InlineCode>&quot;json&quot;</InlineCode> (default) calls{" "}
          <InlineCode>response.json()</InlineCode>, <InlineCode>&quot;text&quot;</InlineCode> calls{" "}
          <InlineCode>response.text()</InlineCode>. A <InlineCode>204</InlineCode> status always
          returns <InlineCode>null</InlineCode>.
        </p>

        <h3 id="default-data">defaultData</h3>
        <p>
          Object merged into every POST/PUT/PATCH request body. Useful for API keys or common
          parameters.
        </p>
      </Prose>

      <CodeBlock code={defaultDataCode} language="typescript" />

      <Prose>
        <h3 id="default-query-params">defaultQueryParams</h3>
        <p>Object merged into every request&apos;s search parameters.</p>
      </Prose>

      <CodeBlock code={defaultQueryParamsCode} language="typescript" />

      <Prose>
        <h3 id="extra-headers">allowedHeaders</h3>
        <p>
          An array of header names that should be preserved when forwarding requests through the
          proxy. By default, only standard headers are forwarded.
        </p>
      </Prose>

      <Prose>
        <h2 id="hooks">Lifecycle Hooks</h2>
        <p>Three hooks give you full control over the request lifecycle at the source level.</p>
      </Prose>

      <CodeBlock code={hooksCode} filename="api/sources.ts" />

      <CodeBlock code={hookInfoCode} language="typescript" />

      <Callout variant="tip" title="Hook vs ky hooks">
        <p>
          <InlineCode>onRequest</InlineCode>, <InlineCode>onResponse</InlineCode>, and{" "}
          <InlineCode>onError</InlineCode> are Nexus-level hooks with access to source/group/query
          metadata. For low-level HTTP hooks, use the <InlineCode>hooks</InlineCode> option from{" "}
          <InlineCode>ky</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="encoders">Custom Encoders</h2>
        <p>Override the default JSON body encoding and search params serialization.</p>
      </Prose>

      <CodeBlock code={encoderCode} language="typescript" />

      <Prose>
        <h2 id="request-abort">Request Abort</h2>
        <p>
          Enable <InlineCode>deduplicate</InlineCode> for automatic request deduplication. When a
          duplicate request is fired while one is in-flight, the previous request is aborted.
        </p>
      </Prose>

      <CodeBlock code={abortCode} language="typescript" />

      <Prose>
        <h2 id="ky-options">ky Options</h2>
        <p>
          All <InlineCode>ky</InlineCode> options (timeout, retry, headers, hooks, etc.) are
          supported and passed through to <InlineCode>ky.create()</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={kyOptionsCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/api/request-group">RequestGroup</Link> — group methods under a
            namespace with shared prefix
          </li>
          <li>
            <Link href="/docs/api/instance">Instance</Link> — the HTTP client that Request
            configures
          </li>
          <li>
            <Link href="/docs/core-concepts/request">Request & RequestGroup Guide</Link> — in-depth
            usage patterns
          </li>
          <li>
            <Link href="/docs/advanced/hooks">Hooks Guide</Link> — detailed hook usage
          </li>
        </ul>
      </Prose>
    </div>
  )
}
