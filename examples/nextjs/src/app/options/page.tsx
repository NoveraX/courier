"use client"

import { isHTTPError } from "@noverax/nexus"
import { useState } from "react"
import { DemoCard } from "@/components/demo-card"
import { ResponseViewer } from "@/components/response-viewer"
import { RunButton } from "@/components/run-button"
import { request } from "@/lib/request"

const timeoutCode = `// Set timeout in milliseconds (ky option)
// The /slow endpoint takes 3 seconds — this will timeout
try {
  await request("mockApi", { timeout: 1000 })("misc:slow");
} catch (error) {
  // TimeoutError or HTTPError with timeout message
  console.error("Request timed out");
}`

const retryCode = `// retry: number of times to retry on failure (ky option)
// Retries on network errors and 408, 413, 429, 500, 502, 503, 504
const data = await request("mockApi", { retry: 3 })(
  "users:getAll", {}
);

// Custom retry config via retry object
const data = await request("mockApi", {
  retry: {
    limit: 3,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503],
    backoffLimit: 3000,
  },
})("users:getAll", {});`

const cacheCode = `// Next.js cache option (passed through to fetch)
const data = await request("mockApi", {
  cache: "force-cache",
})("users:getAll", {});

// No caching
const fresh = await request("mockApi", {
  cache: "no-store",
})("users:getAll", {});`

const revalidateCode = `// Next.js revalidation — ISR-style caching
const data = await request("mockApi", {
  next: { revalidate: 60 },  // revalidate every 60 seconds
})("users:getAll", {});

// Tag-based revalidation
const data = await request("mockApi", {
  next: { tags: ["users"] },
})("users:getAll", {});

// Then in a Server Action:
import { revalidateTag } from "next/cache";
revalidateTag("users");`

const globalDefaultsCode = `import { createClientRequest } from "@noverax/nexus";

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
      window.location.href = "/login";
    }
  },
});`

export default function OptionsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Request Options</h1>
        <p className="text-muted-foreground mt-1">
          Configure timeout, retry, cache, and Next.js revalidation per request or globally.
        </p>
      </div>

      <TimeoutDemo />

      <DemoCard
        title="Retry"
        description="Automatically retry failed requests with configurable limits and backoff."
        code={retryCode}
      >
        <p className="text-sm text-muted-foreground">
          Retry is a ky option passed through to the underlying HTTP client. By default ky retries
          on network errors and specific status codes (408, 413, 429, 500, 502, 503, 504).
        </p>
      </DemoCard>

      <DemoCard
        title="Cache"
        description="Control HTTP caching with the standard cache option."
        code={cacheCode}
      >
        <p className="text-sm text-muted-foreground">
          The <code className="text-xs bg-muted px-1 py-0.5 rounded">cache</code> option maps
          directly to the Fetch API&apos;s{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">RequestCache</code>. Use{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">force-cache</code> for aggressive
          caching or <code className="text-xs bg-muted px-1 py-0.5 rounded">no-store</code> to skip
          the cache entirely.
        </p>
      </DemoCard>

      <DemoCard
        title="Next.js Revalidation"
        description="Use Next.js-specific options for ISR-style caching and tag-based revalidation."
        code={revalidateCode}
      >
        <p className="text-sm text-muted-foreground">
          The <code className="text-xs bg-muted px-1 py-0.5 rounded">next</code> option is passed
          through to the server-side fetch call. Works with both time-based and tag-based
          revalidation strategies.
        </p>
      </DemoCard>

      <DemoCard
        title="Global Defaults"
        description="Set defaults for all requests via createClientRequest or createQueryRequest."
        code={globalDefaultsCode}
      >
        <p className="text-sm text-muted-foreground">
          Global defaults apply to every request made through the instance. Per-request options
          override globals.
        </p>
      </DemoCard>
    </div>
  )
}

function TimeoutDemo() {
  const [timeoutMs, setTimeoutMs] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    type: "success" | "timeout"
    data: unknown
    elapsed: number
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setResult(null)
    const start = Date.now()

    try {
      const data = await request("mockApi", { timeout: timeoutMs })("misc:slow")
      setResult({ type: "success", data, elapsed: Date.now() - start })
    } catch (error: unknown) {
      const elapsed = Date.now() - start
      if (isHTTPError(error)) {
        setResult({
          type: "timeout",
          data: { status: error.status, message: error.message, data: error.data },
          elapsed,
        })
      } else if (error instanceof Error) {
        setResult({
          type: "timeout",
          data: { message: error.message, name: error.name },
          elapsed,
        })
      } else {
        setResult({ type: "timeout", data: { message: "Request timed out" }, elapsed })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <DemoCard
      title="Timeout"
      description="The /slow endpoint takes 3 seconds. Set a shorter timeout to trigger a timeout error."
      code={timeoutCode}
    >
      <div className="flex items-center gap-3">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(Number(e.target.value))}
        >
          <option value={1000}>1s timeout</option>
          <option value={2000}>2s timeout</option>
          <option value={5000}>5s timeout (will succeed)</option>
        </select>
        <RunButton loading={loading} label="Fetch /slow" onClick={handleClick} />
      </div>
      {result ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Elapsed: {result.elapsed}ms</p>
          <ResponseViewer data={result.data} status={result.type === "success" ? 200 : 408} />
        </div>
      ) : null}
    </DemoCard>
  )
}
