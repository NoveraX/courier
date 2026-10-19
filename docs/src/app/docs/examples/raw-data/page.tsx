import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { NormalFetchDemo, RawFetchDemo } from "./_components"

const normalCode = `// Default — returns just the data
const users = await caller.users.getAll()
// → { data: [...], total: 3 }`

const rawDataCode = `// .raw accessor — returns { status, headers, data }
const response = await caller.users.raw.getAll()

// response.status  → 200
// response.headers → Headers { etag, vary, … }: those that describe the answer
// response.data    → { data: [...], total: 3 }`

const typeCode = `// The .raw accessor changes what the call is typed to return
const data = await caller.users.getAll()
//    ^? { data: User[]; total: number }

const response = await caller.users.raw.getAll()
//    ^? HttpResponse<{ data: User[]; total: number }>
//       { status: number; headers: Headers; data: … }`

export const metadata = exampleMetadata("raw-data")

export default function RawDataExamplesPage() {
  return (
    <ExamplePage name="raw-data">
      <ExampleSection
        title="Normal Mode"
        description="Returns just the response data."
        code={normalCode}
      >
        <NormalFetchDemo />
      </ExampleSection>

      <ExampleSection
        title="Raw Data Mode"
        description="Returns status, headers, and data."
        code={rawDataCode}
        learnMore={{ href: "/docs/advanced/raw-data", label: "Raw data docs" }}
      >
        <RawFetchDemo />
      </ExampleSection>

      <ExampleSection
        title="Type Safety"
        description="TypeScript follows the accessor: .raw types the call as an HttpResponse."
        code={typeCode}
      >
        <p className="m-0 text-body text-fg-muted">
          With the <code>.raw</code> accessor, the return type wraps data in an{" "}
          <code>HttpResponse</code> object with status and headers. Without it, you get the data
          directly.
        </p>
      </ExampleSection>
    </ExamplePage>
  )
}
