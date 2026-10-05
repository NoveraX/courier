import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { DedupDemo, ManualAbortDemo } from "./_components"

const manualAbortCode = `const controller = new AbortController()

// Pass signal via .with() to cancel the request at any time
const promise = caller.misc.with({ signal: controller.signal }).slow()

// Cancel the request
controller.abort()`

const dedupCode = `const abortRef = useRef<AbortController | null>(null)

function handleClick() {
  // Abort the previous in-flight request
  abortRef.current?.abort()

  const controller = new AbortController()
  abortRef.current = controller

  caller.users.with({ signal: controller.signal }).getAll()
}`

const deduplicateCode = `import { defineApi } from "@noverax/courier/define"

// deduplicate: true enables automatic deduplication
// at the HttpClient level — if the same path+method is called
// again while a request is in-flight, the old one is aborted
// with a 499 status code.

const api = defineApi({
  baseURL: "http://localhost:4000",
  groups,
  deduplicate: true,
})`

export const metadata = docsMetadata(
  "Abort & Deduplication",
  "Cancel in-flight requests with AbortController and deduplicate rapid calls."
)

export default function AbortExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/abort"
      title="Abort & Deduplication"
      description="Cancel in-flight requests with AbortController and deduplicate rapid calls."
      mode="both"
    >
      <ExampleSection
        title="Manual Abort"
        description="Start a slow request (3s delay) and cancel it before it completes."
        code={manualAbortCode}
        learnMore={{ href: "/docs/advanced/abort", label: "Abort docs" }}
      >
        <ManualAbortDemo />
      </ExampleSection>

      <ExampleSection
        title="Request Deduplication"
        description="Click the button rapidly — each click aborts the previous in-flight request. Only the last request completes."
        code={dedupCode}
      >
        <DedupDemo />
      </ExampleSection>

      <ExampleSection
        title="deduplicate — HttpClient-Level Dedup"
        description="Source-level config that auto-aborts duplicate requests by path+method. Used in direct mode or persistent HttpClient scenarios."
        code={deduplicateCode}
      >
        <p className="m-0 text-body text-fg-muted">
          When <code>deduplicate: true</code> is set, the HttpClient tracks in-flight requests by
          path and method. If a duplicate is fired, the previous one is aborted with status 499.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
