import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { TimeoutDemo } from "./_components"
import { CacheDemo, RetryDemo, ServerTimeoutDemo } from "./server-options"

const timeoutCode = `// How long the browser waits, in ms, via .with()
// The /slow endpoint takes 3 seconds: the browser gives up first, and cancels its request
try {
  await caller.misc.with({ timeout: 1000 }).slow()
} catch (error) {
  // TimeoutError: the call ran out of time in the browser
}`

const serverTimeoutCode = `// How long the server waits for the API, and whether it asks again: the endpoint's own
slowRetried: endpoint
  .get("slow")
  .timeout(1000)
  .retry({ limit: 1, delay: 200, jitter: "none", retryOn: ["timeout"] })

await caller.misc.slowRetried()
// → 504 after two attempts of a second each`

const retryCode = `// Asked again on the server: twice more on a 503, 300 ms after each attempt
flaky: endpoint
  .get("error/:code")
  .variables<{ code: number }>()
  .retry({ limit: 2, delay: 300, backoff: "fixed", jitter: "none", retryOn: [503] })

await caller.misc.flaky({ code: 503 })
// → 503 after three attempts`

const cacheCode = `// A read kept on the server for 30 s, a copy for each visitor
import { cacheMiddleware } from "@noverax/courier/middleware"

cached: endpoint
  .get("")
  .use(cacheMiddleware({ scope: visitorScope, ttl: 30_000, maxEntries: 200 }))

await caller.posts.cached() // the API answers, and its answer is kept
await caller.posts.cached() // the cache answers: no request reaches the API`

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

const globalDefaultsCode = `import { createProxyCaller } from "@noverax/courier/client"
import { routes } from "@noverax/courier/routes"

// Set defaults for all requests
const caller = createProxyCaller(routes.api, {
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

export const metadata = exampleMetadata("options")

export default function OptionsExamplesPage() {
  return (
    <ExamplePage name="options">
      <ExampleSection
        title="Timeout"
        description="The /slow endpoint takes 3 seconds. Set a shorter timeout to trigger a timeout error: the browser gives up, and cancels its request — Chrome records it below, cancelled; Safari records none."
        code={timeoutCode}
        learnMore={{ href: "/docs/advanced/options", label: "Options docs" }}
      >
        <TimeoutDemo />
      </ExampleSection>

      <ExampleSection
        title="Timeout on the Server"
        description="An endpoint's own timeout bounds the site's server's request to the API, and its retry asks again: the request below shows both attempts, each given up after a second, and the 504 the route answered with."
        code={serverTimeoutCode}
      >
        <ServerTimeoutDemo />
      </ExampleSection>

      <ExampleSection
        title="Retry"
        description="An endpoint's retry policy asks again on the answers it names. The request below shows each attempt, when it was sent and what the API answered."
        code={retryCode}
        learnMore={{ href: "/docs/middleware/built-in", label: "Retry docs" }}
      >
        <RetryDemo />
      </ExampleSection>

      <ExampleSection
        title="Cache"
        description="cacheMiddleware keeps a successful read on the server for a while: the second read within 30 s is answered from it, and the request below says so — no request reaches the API."
        code={cacheCode}
      >
        <CacheDemo />
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
