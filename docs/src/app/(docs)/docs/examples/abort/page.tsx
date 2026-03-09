import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { DedupDemo, ManualAbortDemo } from "./_components"

const manualAbortCode = `const controller = new AbortController()

// Pass signal to cancel the request at any time
const promise = request("mockApi", { signal: controller.signal })(
  "misc:slow"
)

// Cancel the request
controller.abort()`

const dedupCode = `const abortRef = useRef<AbortController | null>(null)

function handleClick() {
  // Abort the previous in-flight request
  abortRef.current?.abort()

  const controller = new AbortController()
  abortRef.current = controller

  request("mockApi", { signal: controller.signal })(
    "users:getAll", {}
  )
}`

const deduplicateCode = `import { Datasource } from "@noverax/nexus/datasource"

// deduplicate: true enables automatic deduplication
// at the HttpClient level — if the same path+method is called
// again while a request is in-flight, the old one is aborted
// with a 499 status code.

class Api extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups,
      deduplicate: true,
    })
  }
}`

export const metadata = docsMetadata(
  "Abort & Deduplication",
  "Cancel in-flight requests with AbortController and deduplicate rapid calls."
)

export default function AbortExamplesPage() {
  return (
    <>
      <PageHeader
        title="Abort & Deduplication"
        description="Cancel in-flight requests with AbortController and deduplicate rapid calls."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Manual Abort"
          description="Start a slow request (3s delay) and cancel it before it completes."
          code={manualAbortCode}
          learnMoreHref="/docs/advanced/abort"
          learnMoreLabel="Abort docs"
        >
          <ManualAbortDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Request Deduplication"
          description="Click the button rapidly — each click aborts the previous in-flight request. Only the last request completes."
          code={dedupCode}
        >
          <DedupDemo />
        </ExampleBlock>

        <ExampleBlock
          title="deduplicate — HttpClient-Level Dedup"
          description="Source-level config that auto-aborts duplicate requests by path+method. Used in direct mode or persistent HttpClient scenarios."
          code={deduplicateCode}
        >
          <p className="text-sm text-muted-foreground">
            When <code className="rounded bg-muted px-1 py-0.5 text-xs">deduplicate: true</code> is
            set, the HttpClient tracks in-flight requests by path and method. If a duplicate is fired,
            the previous one is aborted with status 499.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
