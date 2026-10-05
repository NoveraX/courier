import { docsMetadata } from "@/lib/metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

import { NormalFetchDemo, RawFetchDemo } from "./_components"

const normalCode = `// Default — returns just the data
const users = await caller.users.getAll()
// → { data: [...], total: 3 }`

const rawDataCode = `// .raw accessor — returns { status, headers, data }
const response = await caller.users.raw.getAll()

// response.status  → 200
// response.headers → { "content-type": "application/json", ... }
// response.data    → { data: [...], total: 3 }`

const typeCode = `// TypeScript type changes based on .raw accessor
type EndpointReturn<R, Raw extends boolean> = Promise<
  Raw extends true
    ? Partial<HttpResponse<R>>  // { status, headers, data }
    : R                          // just the data
>

// Usage with type safety:
const data = await caller.users.getAll()
//    ^? { data: User[], total: number }

const raw = await caller.users.raw.getAll()
//    ^? { status?: number, headers?: Headers, data?: ... }`

export const metadata = docsMetadata(
  "Raw Data Mode",
  "Access full response metadata with rawData: true — status code, headers, and data in one object."
)

export default function RawDataExamplesPage() {
  return (
    <ExamplePage
      href="/docs/examples/raw-data"
      title="Raw Data Mode"
      description="Access full response metadata with rawData: true — status code, headers, and data in one object."
      mode="both"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
      </div>

      <ExampleSection
        title="Type Safety"
        description="TypeScript infers the return type based on the rawData flag."
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
