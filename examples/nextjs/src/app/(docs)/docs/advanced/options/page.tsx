import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const baseOptionsCode = `type BaseOptions = {
  // URL & encoding
  baseURL: string                              // Prefix URL for all requests
  responseType?: "json" | "text"               // Response parsing (default: "json")
  defaultData?: Record<string, unknown>        // Merged into every request body
  defaultQueryParams?: Record<string, unknown> // Merged into every query string
  bodyEncoder?: (body: unknown) => unknown     // Custom body serializer
  searchParamsEncoder?: (params: unknown) => string // Custom query serializer
  extraHeaders?: string[]                      // Additional header names to forward

  // Behavior
  requestAbort?: boolean                       // Enable request deduplication
  timeout?: number                             // Request timeout in ms
  retry?: number | RetryOptions                // Retry configuration
  headers?: HeadersInit                        // Static headers for all requests
  credentials?: RequestCredentials             // Cookie handling mode

  // Hooks
  onRequest?: (info: HookInfo) => HookInfo | undefined | Promise<...>
  onResponse?: (info: HookInfo, response: ResponseInfo) => ResponseInfo | undefined | Promise<...>
  onError?: (info: HookInfo, error: HTTPError) => undefined | Promise<undefined>

  // All other ky options (cache, mode, redirect, signal, etc.)
}`

const methodOptionsCode = `type MethodsInstanceOptions = {
  rawData?: boolean           // Return { status, headers, data } instead of just data
  stream?: boolean            // Return ReadableStream instead of parsed response
  passVars?: boolean          // Pass variables to method body (default: true)
  onUploadProgress?: (progress: {
    percent: number
    transferredBytes: number
    totalBytes: number
  }) => void                  // Upload progress callback
}`

const timeoutRetryCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,

      // Timeout after 10 seconds
      timeout: 10_000,

      // Retry failed requests up to 3 times
      retry: {
        limit: 3,
        methods: ["get"],           // Only retry GET requests
        statusCodes: [408, 502, 503, 504],
        backoffLimit: 3000,         // Max delay between retries (ms)
        delay: (attemptCount) => 1000 * attemptCount, // Linear backoff
      },
    })
  }
}`

const cachingCode = `// Per-request caching with Next.js ISR
const users = await directRequest("myApi", {
  next: { revalidate: 60 },              // Revalidate every 60 seconds
})("users:getAll")

// Tag-based revalidation
const post = await directRequest("myApi", {
  next: { tags: ["posts", \`post-\${id}\`] }, // Revalidate by tag
})("posts:getById", { id })

// Force no caching
const live = await directRequest("myApi", {
  cache: "no-store",                      // Always fetch fresh data
})("stats:realtime")`

const headersCode = `// Static headers on the source (apply to all requests)
class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      headers: {
        "X-API-Version": "2",
        "Accept-Language": "en",
      },
    })
  }
}

// Per-request headers
const data = await request("myApi", {
  headers: { "X-Custom-Header": "value" },
})("users:getAll")`

const precedenceCode = `// Options are merged with this precedence (highest wins):
// 1. Per-request options  → request("myApi", { timeout: 5000 })("...")
// 2. Source-level options → super({ timeout: 10000, ... })
// 3. ky defaults          → ky's built-in defaults

// Example: source sets 10s timeout, but this request uses 5s
class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      timeout: 10_000,  // Default for all requests in this source
    })
  }
}

// Override timeout for a slow endpoint
const report = await request("myApi", {
  timeout: 30_000,
})("reports:generate", { type: "annual" })`

export default async function OptionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Options"
        description="Full reference of source-level and per-request configuration options."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          Nexus options are split into two layers: <strong>BaseOptions</strong> for source-level
          configuration (applies to all methods in a source) and{" "}
          <strong>MethodsInstanceOptions</strong> for per-request overrides. Both layers build on
          top of ky&apos;s options, so any ky-compatible option can also be used.
        </p>
      </Prose>

      <Prose>
        <h2 id="base-options">BaseOptions</h2>

        <p>
          Set in the <InlineCode>Request</InlineCode> constructor via{" "}
          <InlineCode>super()</InlineCode>. These apply to every request made through this source:
        </p>
      </Prose>

      <CodeBlock code={baseOptionsCode} filename="types" />

      <Prose>
        <h2 id="method-options">MethodsInstanceOptions</h2>

        <p>
          Passed as the second argument to a request function call. These are per-request options
          that control how a single request behaves:
        </p>
      </Prose>

      <CodeBlock code={methodOptionsCode} filename="types" />

      <Prose>
        <h2 id="timeout-retry">Timeout & retry</h2>

        <p>
          Configure request timeouts and automatic retry behavior. Retry uses ky&apos;s built-in
          retry logic with exponential or custom backoff:
        </p>
      </Prose>

      <CodeBlock code={timeoutRetryCode} filename="api/sources.ts" />

      <Callout variant="info" title="Retry methods">
        <p>
          By default, ky only retries <InlineCode>GET</InlineCode>, <InlineCode>PUT</InlineCode>,
          and <InlineCode>HEAD</InlineCode> requests. POST, PATCH, and DELETE are not retried by
          default since they may not be idempotent. Override this with{" "}
          <InlineCode>retry.methods</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="caching">Next.js caching</h2>

        <p>
          In direct mode, you can pass Next.js-specific caching options via the{" "}
          <InlineCode>next</InlineCode> and <InlineCode>cache</InlineCode> fields. These are
          forwarded directly to the underlying fetch call:
        </p>
      </Prose>

      <CodeBlock code={cachingCode} filename="app/page.tsx" />

      <Callout variant="warning" title="Direct mode only">
        <p>
          The <InlineCode>next</InlineCode> and <InlineCode>cache</InlineCode> options only work in
          direct mode (server-side). In proxy mode, the browser makes a POST to your API route, and
          Next.js caching does not apply to POST requests.
        </p>
      </Callout>

      <Prose>
        <h2 id="headers">Headers</h2>

        <p>
          Set static headers at the source level or override them per-request. Source-level headers
          apply to all requests; per-request headers are merged on top:
        </p>
      </Prose>

      <CodeBlock code={headersCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="precedence">Option precedence</h2>

        <p>
          When the same option is set at multiple levels, per-request options take the highest
          priority:
        </p>
      </Prose>

      <CodeBlock code={precedenceCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="credentials">Credentials</h2>

        <p>
          The <InlineCode>credentials</InlineCode> option controls cookie handling:
        </p>

        <ul>
          <li>
            <InlineCode>&quot;include&quot;</InlineCode> — send cookies with cross-origin requests
            (default in proxy mode)
          </li>
          <li>
            <InlineCode>&quot;same-origin&quot;</InlineCode> — send cookies only to same-origin
            requests
          </li>
          <li>
            <InlineCode>&quot;omit&quot;</InlineCode> — never send cookies
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/hooks">Hooks</Link> — lifecycle hooks for request
            interception and transformation
          </li>
          <li>
            <Link href="/docs/advanced/raw-data">Raw Data Mode</Link> — using rawData to access
            status codes and headers
          </li>
          <li>
            <Link href="/docs/advanced/streaming">Streaming</Link> — enabling stream mode for
            ReadableStream responses
          </li>
          <li>
            <Link href="/options">Options Example</Link> — interactive demo of timeout, retry, and
            cache options
          </li>
        </ul>
      </Prose>
    </div>
  )
}
