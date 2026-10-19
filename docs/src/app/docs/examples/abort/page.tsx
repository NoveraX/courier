import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { CancelPreviousDemo, ManualAbortDemo, SharedReadsDemo } from "./_components"

const manualAbortCode = `const controller = new AbortController()

// Pass signal via .with() to cancel the request at any time
const promise = caller.misc.with({ signal: controller.signal }).slow()

// Cancel the request
controller.abort()`

const sharedReadsCode = `// Three components read the same list at the same moment
const [header, sidebar, page] = await Promise.all([
  caller.users.getAll(),
  caller.users.getAll(),
  caller.users.getAll(),
])

// One request reached the proxy; each call got a copy of its own`

const cancelPreviousCode = `import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "@/courier.routes"

const searchCaller = createProxyCaller(apiRoutes, {
  cancelPrevious: ["misc.slow"],
})

// A newer call cancels the one still in flight: it rejects with status 499
await searchCaller.misc.slow()`

export const metadata = exampleMetadata("abort")

export default function AbortExamplesPage() {
  return (
    <ExamplePage name="abort">
      <ExampleSection
        title="Identical reads share one request"
        description="Three identical reads start together. The browser counts the requests that reached the proxy."
        code={sharedReadsCode}
        learnMore={{ href: "/docs/advanced/abort", label: "Deduplication docs" }}
      >
        <SharedReadsDemo />
      </ExampleSection>

      <ExampleSection
        title="Cancel the previous call"
        description="The endpoint answers after 3 s. Call again before it does: the older call is cancelled with status 499, and the newer one is answered by the request already in flight."
        code={cancelPreviousCode}
        learnMore={{
          href: "/docs/advanced/abort#cancelling-the-previous-call",
          label: "cancelPrevious docs",
        }}
      >
        <CancelPreviousDemo />
      </ExampleSection>

      <ExampleSection
        title="Manual abort"
        description="Start a slow request (3s delay) and cancel it before it completes."
        code={manualAbortCode}
        learnMore={{ href: "/docs/advanced/abort#aborting-a-call-yourself", label: "Abort docs" }}
      >
        <ManualAbortDemo />
      </ExampleSection>
    </ExamplePage>
  )
}
