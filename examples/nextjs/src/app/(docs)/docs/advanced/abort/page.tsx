import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const enableCode = `import { Request } from "@noverax/nexus/RequestClass"

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
      requestAbort: true, // Enable automatic deduplication
    })
  }
}`

const dedupKeyCode = `// Dedup key format: METHOD:origin/path
// Query string and hash are ignored

// These two requests share the same dedup key (GET:https://api.example.com/users):
request("myApi")("users:getAll", { page: 1 })  // ← aborted (status 499)
request("myApi")("users:getAll", { page: 2 })  // ← executes

// These have different keys (different paths):
request("myApi")("users:getById", { id: 1 })   // GET:https://api.example.com/users/1
request("myApi")("users:getById", { id: 2 })   // GET:https://api.example.com/users/2`

const handleAbortCode = `"use client"

import { useMutation, useQuery } from "@/lib/request"

export function SearchUsers() {
  const [query, setQuery] = useState("")

  // With requestAbort enabled, rapid typing aborts previous searches
  const { data, error } = useQuery("myApi", "users:search", {
    variables: { q: query },
    enabled: query.length > 0,
  })

  // Filter out abort errors (status 499) in error handling
  useEffect(() => {
    if (error && "response" in error) {
      const status = (error as any).response?.status
      if (status === 499) return // Ignore aborted requests
      console.error("Search failed:", error)
    }
  }, [error])

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      {data?.map((user) => <p key={user.id}>{user.name}</p>)}
    </div>
  )
}`

const manualAbortCode = `"use client"

import { useEffect, useRef } from "react"

import { request } from "@/lib/request"

export function CancellableRequest() {
  const controllerRef = useRef<AbortController | null>(null)

  async function fetchData() {
    // Cancel any previous request
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    try {
      const data = await request("myApi", {
        signal: controllerRef.current.signal,
      })("reports:generate", { type: "monthly" })

      console.log("Report:", data)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("Request was cancelled")
        return
      }
      throw error
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  return (
    <div>
      <button onClick={fetchData}>Generate Report</button>
      <button onClick={() => controllerRef.current?.abort()}>Cancel</button>
    </div>
  )
}`

const internalsCode = `// How deduplication works internally:

// 1. beforeRequestHook runs before each request
//    - Computes dedup key: METHOD:origin/path
//    - If a request with the same key exists, aborts it (status 499)
//    - Stores new AbortController in currentExecutingRequests map

// 2. afterResponse runs when a request completes
//    - Removes the entry from currentExecutingRequests

// 3. Signal merging
//    - If you also pass a manual signal, both signals are combined
//    - Uses AbortSignal.any() — request aborts if either signal fires`

export default async function AbortPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Abort & Deduplication"
        description="Automatically cancel duplicate in-flight requests and manually abort with AbortController."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          When users interact quickly — typing in a search box, clicking pagination rapidly, or
          switching filters — multiple requests for the same endpoint can be in flight
          simultaneously. Nexus can automatically abort the previous request when a new one starts
          for the same endpoint.
        </p>

        <p>
          Enable this by setting <InlineCode>requestAbort: true</InlineCode> in your source options.
          Nexus will track active requests and cancel duplicates before they complete.
        </p>
      </Prose>

      <Prose>
        <h2 id="enabling">Enabling deduplication</h2>

        <p>
          Set <InlineCode>requestAbort: true</InlineCode> in <InlineCode>BaseOptions</InlineCode>{" "}
          when creating your <InlineCode>Request</InlineCode> class. This applies to all methods in
          the source:
        </p>
      </Prose>

      <CodeBlock code={enableCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="dedup-key">Deduplication key</h2>

        <p>
          The dedup key is computed as <InlineCode>METHOD:origin/path</InlineCode>. The query string
          and hash are intentionally ignored — this means requests to the same endpoint with
          different query parameters are treated as duplicates:
        </p>
      </Prose>

      <CodeBlock code={dedupKeyCode} />

      <Callout variant="info" title="Why ignore query params?">
        <p>
          In search-as-you-type scenarios, each keystroke sends a new query to the same endpoint.
          You typically only care about the latest results. By ignoring query parameters in the
          dedup key, the previous search is automatically cancelled.
        </p>
      </Callout>

      <Prose>
        <h2 id="abort-behavior">Abort behavior</h2>

        <p>When a duplicate request is detected:</p>

        <ol>
          <li>
            The <strong>previous</strong> request is aborted and throws an{" "}
            <InlineCode>HTTPError</InlineCode> with status <InlineCode>499</InlineCode>.
          </li>
          <li>
            The <strong>new</strong> request proceeds normally.
          </li>
          <li>
            If the <InlineCode>onError</InlineCode> hook is defined, it receives the abort error.
          </li>
        </ol>
      </Prose>

      <Prose>
        <h2 id="handling-abort-errors">Handling abort errors</h2>

        <p>
          Aborted requests throw with status 499. In most cases you want to silently ignore these
          errors since they represent intentional cancellation:
        </p>
      </Prose>

      <CodeBlock code={handleAbortCode} filename="components/search-users.tsx" />

      <Prose>
        <h2 id="manual-abort">Manual abort with AbortController</h2>

        <p>
          You can also manually abort requests by passing a <InlineCode>signal</InlineCode> in the
          request options. This works independently of the deduplication feature — you can use one
          or both:
        </p>
      </Prose>

      <CodeBlock code={manualAbortCode} filename="components/cancellable-request.tsx" />

      <Callout variant="tip" title="Signal merging">
        <p>
          If you use both <InlineCode>requestAbort: true</InlineCode> and a manual{" "}
          <InlineCode>signal</InlineCode>, Nexus combines them using{" "}
          <InlineCode>AbortSignal.any()</InlineCode>. The request aborts if either signal fires.
        </p>
      </Callout>

      <Prose>
        <h2 id="internals">How it works internally</h2>

        <p>
          Deduplication is implemented via ky hooks on the <InlineCode>Instance</InlineCode> class.
          Understanding the internals helps when debugging abort-related issues:
        </p>
      </Prose>

      <CodeBlock code={internalsCode} />

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/advanced/hooks">Hooks</Link> — use onError to filter out abort errors
            from your monitoring
          </li>
          <li>
            <Link href="/docs/advanced/options">Options</Link> — signal, retry, and other
            request-level options
          </li>
          <li>
            <Link href="/abort">Abort Example</Link> — interactive demo of deduplication in action
          </li>
        </ul>
      </Prose>
    </div>
  )
}
