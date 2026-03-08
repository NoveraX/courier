import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { TimeoutDemo } from "./_components"

const timeoutCode = `// Set timeout in milliseconds (ky option)
// The /slow endpoint takes 3 seconds — this will timeout
try {
  await request("mockApi", { timeout: 1000 })("misc:slow")
} catch (error) {
  // TimeoutError or HTTPError with timeout message
  console.error("Request timed out")
}`

const retryCode = `// retry: number of times to retry on failure (ky option)
// Retries on network errors and 408, 413, 429, 500, 502, 503, 504
const data = await request("mockApi", { retry: 3 })(
  "users:getAll", {}
)

// Custom retry config via retry object
const data = await request("mockApi", {
  retry: {
    limit: 3,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503],
    backoffLimit: 3000,
  },
})("users:getAll", {})`

const cacheCode = `// Next.js cache option (passed through to fetch)
const data = await request("mockApi", {
  cache: "force-cache",
})("users:getAll", {})

// No caching
const fresh = await request("mockApi", {
  cache: "no-store",
})("users:getAll", {})`

const revalidateCode = `// Next.js revalidation — ISR-style caching
const data = await request("mockApi", {
  next: { revalidate: 60 },  // revalidate every 60 seconds
})("users:getAll", {})

// Tag-based revalidation
const data = await request("mockApi", {
  next: { tags: ["users"] },
})("users:getAll", {})

// Then in a Server Action:
import { revalidateTag } from "next/cache"
revalidateTag("users")`

const globalDefaultsCode = `import { createClientRequest } from "@noverax/nexus"

// Set defaults for all requests
const request = createClientRequest({
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
    <>
      <PageHeader
        title="Request Options"
        description="Configure timeout, retry, cache, and Next.js revalidation per request or globally."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Timeout"
          description="The /slow endpoint takes 3 seconds. Set a shorter timeout to trigger a timeout error."
          code={timeoutCode}
          learnMoreHref="/docs/advanced/options"
          learnMoreLabel="Options docs"
        >
          <TimeoutDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Retry"
          description="Automatically retry failed requests with configurable limits and backoff."
          code={retryCode}
        >
          <p className="text-sm text-muted-foreground">
            Retry is a ky option passed through to the underlying HTTP client. By default ky retries
            on network errors and specific status codes (408, 413, 429, 500, 502, 503, 504).
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Cache"
          description="Control HTTP caching with the standard cache option."
          code={cacheCode}
        >
          <p className="text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">cache</code> option maps
            directly to the Fetch API&apos;s{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">RequestCache</code>. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">force-cache</code> for aggressive
            caching or <code className="rounded bg-muted px-1 py-0.5 text-xs">no-store</code> to
            skip the cache entirely.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Next.js Revalidation"
          description="Use Next.js-specific options for ISR-style caching and tag-based revalidation."
          code={revalidateCode}
        >
          <p className="text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">next</code> option is passed
            through to the server-side fetch call. Works with both time-based and tag-based
            revalidation strategies.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Global Defaults"
          description="Set defaults for all requests via createClientRequest or createQueryRequest."
          code={globalDefaultsCode}
        >
          <p className="text-sm text-muted-foreground">
            Global defaults apply to every request made through the instance. Per-request options
            override globals.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
