import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

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
    <>
      <PageHeader
        title="Raw Data Mode"
        description="Access full response metadata with rawData: true — status code, headers, and data in one object."
        mode="both"
      />

      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExampleBlock
            title="Normal Mode"
            description="Returns just the response data."
            code={normalCode}
          >
            <NormalFetchDemo />
          </ExampleBlock>

          <ExampleBlock
            title="Raw Data Mode"
            description="Returns status, headers, and data."
            code={rawDataCode}
            learnMoreHref="/docs/advanced/raw-data"
            learnMoreLabel="Raw data docs"
          >
            <RawFetchDemo />
          </ExampleBlock>
        </div>

        <ExampleBlock
          title="Type Safety"
          description="TypeScript infers the return type based on the rawData flag."
          code={typeCode}
        >
          <p className="text-sm text-muted-foreground">
            With the <code className="rounded bg-muted px-1 py-0.5 text-xs">.raw</code> accessor,
            the return type wraps data in an{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">HttpResponse</code> object with
            status and headers. Without it, you get the data directly.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
