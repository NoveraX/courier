import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { CancelPreviousDemo, ManualAbortDemo, SharedReadsDemo } from "./_components"

// side="page"
const manualAbortCode = `const controller = new AbortController()

// Pass signal via .with() to cancel the request at any time
const promise = caller.misc.with({ signal: controller.signal }).slow()

// Cancel the request
controller.abort()`

// side="page"
const sharedReadsCode = `// Three components read the same list at the same moment
const [header, sidebar, page] = await Promise.all([
  caller.users.getAll(),
  caller.users.getAll(),
  caller.users.getAll(),
])

// One request reached the proxy; each call got a copy of its own`

// side="page"
const cancelPreviousCode = `import { createProxyCaller } from "@noverax/courier/client"
import { routes } from "@noverax/courier/routes"

const caller = createProxyCaller(routes.api)

// A newer call made the same way cancels the one still in flight, which rejects with an
// AbortError whose code is "SUPERSEDED"
await caller.misc.with({ cancelPrevious: true }).slow()

// Or once for every call of the endpoint, where it is defined:
// slow: endpoint.get("slow").cancelPrevious()`

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
        description="The endpoint answers after 3 s. Call again before it does: the older call is cancelled with an AbortError, its code SUPERSEDED, and the newer one is answered by the request already in flight."
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
