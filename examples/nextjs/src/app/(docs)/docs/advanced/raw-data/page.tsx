import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const comparisonCode = `// Normal mode (default) — returns just the data
const users = await request("myApi")("users:getAll")
// users = [{ id: 1, name: "Jane" }, ...]

// Raw data mode — returns status, headers, and data
const response = await request("myApi", { rawData: true })("users:getAll")
// response = {
//   status: 200,
//   headers: Headers { "content-type": "application/json", ... },
//   data: [{ id: 1, name: "Jane" }, ...],
// }`

const createCheckCode = `async function createUser(data: { name: string; email: string }) {
  const response = await request("myApi", { rawData: true })("users:create", data)

  if (response.status === 201) {
    console.log("User created:", response.data)
    return { created: true, user: response.data }
  }

  if (response.status === 200) {
    console.log("User already existed:", response.data)
    return { created: false, user: response.data }
  }

  return { created: false, user: null }
}`

const paginationCode = `async function fetchPaginatedUsers(page: number) {
  const response = await request("myApi", { rawData: true })("users:getAll", {
    page,
    limit: 20,
  })

  // Read pagination info from response headers
  const totalCount = Number(response.headers?.get("X-Total-Count") ?? 0)
  const linkHeader = response.headers?.get("Link") ?? ""

  return {
    users: response.data,
    total: totalCount,
    hasMore: page * 20 < totalCount,
  }
}`

const rateLimitCode = `async function safeRequest<T>(
  source: string,
  query: string,
  variables?: unknown
): Promise<{ data: T; rateLimited: boolean }> {
  const response = await request(source, { rawData: true })(query, variables)

  const remaining = Number(response.headers?.get("X-RateLimit-Remaining") ?? -1)
  const resetAt = response.headers?.get("X-RateLimit-Reset")

  if (remaining <= 5 && remaining >= 0) {
    console.warn(\`Rate limit warning: \${remaining} requests remaining, resets at \${resetAt}\`)
  }

  return {
    data: response.data as T,
    rateLimited: remaining === 0,
  }
}`

const directModeCode = `// Raw data works identically in direct mode
import { directRequest } from "@/lib/direct-request"

export default async function DashboardPage() {
  const response = await directRequest("myApi", { rawData: true })("stats:overview")

  // Same shape: { status, headers, data }
  const cacheStatus = response.headers?.get("X-Cache")

  return (
    <div>
      <p>Cache: {cacheStatus}</p>
      <pre>{JSON.stringify(response.data, null, 2)}</pre>
    </div>
  )
}`

export const metadata = docsMetadata(
  "Raw Data Mode",
  "Access response status codes and headers alongside the parsed data."
)

export default async function RawDataPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Raw Data Mode"
        description="Access response status codes and headers alongside the parsed data."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          By default, Nexus returns only the parsed response body (JSON or text). When you need to
          inspect the HTTP status code or read response headers, enable raw data mode by passing{" "}
          <InlineCode>{"{ rawData: true }"}</InlineCode> in the request options.
        </p>

        <p>
          Raw data mode changes the return type from <InlineCode>Promise{"<T>"}</InlineCode> to{" "}
          <InlineCode>Promise{"<{ status, headers, data }>"}</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={comparisonCode} />

      <Prose>
        <h2 id="usage">Enabling raw data mode</h2>

        <p>
          Pass <InlineCode>rawData: true</InlineCode> as the second argument to your request
          function. This is set per-request, not per-source, so you can use it only where you need
          the extra metadata:
        </p>
      </Prose>

      <Callout variant="info" title="Per-request option">
        <p>
          <InlineCode>rawData</InlineCode> is a <InlineCode>MethodsInstanceOptions</InlineCode>{" "}
          field. It does not go in <InlineCode>BaseOptions</InlineCode> on the source — you enable
          it on individual requests where you need status or headers.
        </p>
      </Callout>

      <Prose>
        <h2 id="status-codes">Checking status codes</h2>

        <p>
          Use raw data mode when your API uses different status codes to communicate different
          outcomes. For example, distinguishing between &quot;created&quot; (201) and &quot;already
          exists&quot; (200):
        </p>
      </Prose>

      <CodeBlock code={createCheckCode} filename="lib/api-helpers.ts" />

      <Prose>
        <h2 id="reading-headers">Reading response headers</h2>

        <p>
          Many APIs include useful metadata in response headers. Raw data mode gives you access to
          the full <InlineCode>Headers</InlineCode> object:
        </p>

        <h3 id="pagination-headers">Pagination headers</h3>
      </Prose>

      <CodeBlock code={paginationCode} filename="lib/api-helpers.ts" />

      <Prose>
        <h3 id="rate-limit-headers">Rate-limit headers</h3>
      </Prose>

      <CodeBlock code={rateLimitCode} filename="lib/api-helpers.ts" />

      <Prose>
        <h2 id="direct-mode">Raw data in direct mode</h2>

        <p>
          Raw data mode works identically in both proxy and direct modes. The response shape is
          always <InlineCode>{"{ status, headers, data }"}</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={directModeCode} filename="app/dashboard/page.tsx" />

      <Callout variant="tip" title="Type inference with rawData">
        <p>
          When <InlineCode>rawData: true</InlineCode> is set, TypeScript automatically infers the
          return type as <InlineCode>{"Promise<Partial<MethodKyResponse<T>>>"}</InlineCode> instead
          of <InlineCode>{"Promise<T>"}</InlineCode>. The <InlineCode>data</InlineCode> field inside
          the response retains the original method&apos;s response type.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/streaming">Streaming</Link> — receive responses as
            ReadableStreams for SSE and large downloads
          </li>
          <li>
            <Link href="/docs/advanced/options">Options</Link> — all per-request options including
            rawData, stream, and passVars
          </li>
          <li>
            <Link href="/raw-data">Raw Data Example</Link> — interactive demo of raw data mode
          </li>
        </ul>
      </Prose>
    </div>
  )
}
