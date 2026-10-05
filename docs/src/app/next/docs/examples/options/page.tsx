import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { TimeoutDemo } from "./_components"

const timeoutCode = `// Set timeout in milliseconds via .with()
// The /slow endpoint takes 3 seconds — this will timeout
try {
  await caller.misc.with({ timeout: 1000 }).slow()
} catch (error) {
  // HTTPError with timeout message
  console.error("Request timed out")
}`

const retryCode = `// Use retryMiddleware for automatic retries
import { retryMiddleware } from "@noverax/courier/middleware"

const api = defineApi({
  baseURL: "...",
  middleware: [
    retryMiddleware({
      limit: 3,
      backoff: 300,
      retryOn: (res) => [408, 502, 503, 504].includes(res.status),
    }),
  ],
  groups: { users },
})`

const cacheCode = `// Next.js cache option (passed through to fetch)
const data = await caller.users.with({
  cache: "force-cache",
}).getAll()

// No caching
const fresh = await caller.users.with({
  cache: "no-store",
}).getAll()`

const revalidateCode = `// Next.js revalidation — ISR-style caching
const data = await caller.users.with({
  next: { revalidate: 60 },  // revalidate every 60 seconds
}).getAll()

// Tag-based revalidation
const data = await caller.users.with({
  next: { tags: ["users"] },
}).getAll()

// Then in a Server Action:
import { revalidateTag } from "next/cache"
revalidateTag("users")`

const globalDefaultsCode = `import { createProxyCaller } from "@noverax/courier"

// Set defaults for all requests
const caller = createProxyCaller<typeof api>("api", {
  timeout: 10000,           // 10s default timeout
  credentials: "include",  // send cookies
  headers: {
    "X-Custom-Header": "value",
  },

  // Global error handler
  onError: (error) => {
    if (error.status === 401) {
      window.location.href = "/login"
    }
  },
})`

export const metadata = docsMetadata(
  "Request Options",
  "Configure timeout, retry, cache, and Next.js revalidation per request or globally."
)

export default function OptionsExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/options"
      title="Request Options"
      description="Configure timeout, retry, cache, and Next.js revalidation per request or globally."
      mode="both"
    >
      <ExampleSection
        title="Timeout"
        description="The /slow endpoint takes 3 seconds. Set a shorter timeout to trigger a timeout error."
        code={timeoutCode}
        learnMore={{ href: "/docs/advanced/options", label: "Options docs" }}
      >
        <TimeoutDemo />
      </ExampleSection>

      <ExampleSection
        title="Retry"
        description="Automatically retry failed requests with configurable limits and backoff."
        code={retryCode}
      >
        <p className="m-0 text-body text-fg-muted">
          Retry is handled via retryMiddleware from @noverax/courier/middleware. It supports
          exponential backoff and custom retry conditions.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Cache"
        description="Control HTTP caching with the standard cache option."
        code={cacheCode}
      >
        <p className="m-0 text-body text-fg-muted">
          The <code>cache</code> option maps directly to the Fetch API&apos;s{" "}
          <code>RequestCache</code>. Use <code>force-cache</code> for aggressive caching or{" "}
          <code>no-store</code> to skip the cache entirely.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Next.js Revalidation"
        description="Use Next.js-specific options for ISR-style caching and tag-based revalidation."
        code={revalidateCode}
      >
        <p className="m-0 text-body text-fg-muted">
          The <code>next</code> option is passed through to the server-side fetch call. Works with
          both time-based and tag-based revalidation strategies.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Global Defaults"
        description="Set defaults for all requests via createProxyCaller or createProxyQueryCaller."
        code={globalDefaultsCode}
      >
        <p className="m-0 text-body text-fg-muted">
          Global defaults apply to every request made through the instance. Per-request options
          override globals.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
