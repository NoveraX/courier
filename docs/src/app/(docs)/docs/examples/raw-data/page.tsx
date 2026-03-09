import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { NormalFetchDemo, RawFetchDemo } from "./_components"

const normalCode = `// Default — returns just the data
const users = await request("mockApi")("users:getAll", {})
// → { data: [...], total: 3 }`

const rawDataCode = `// rawData: true — returns { status, headers, data }
const response = await request("mockApi", { rawData: true })(
  "users:getAll", {}
)

// response.status  → 200
// response.headers → { "content-type": "application/json", ... }
// response.data    → { data: [...], total: 3 }`

const typeCode = `// TypeScript type changes based on rawData flag
type MethodRequestResponse<T extends boolean, R> = Promise<
  T extends true
    ? Partial<MethodKyResponse<R>>  // { status, headers, data }
    : R                              // just the data
>

// Usage with type safety:
const data = await request("mockApi")("users:getAll", {})
//    ^? { data: User[], total: number }

const raw = await request("mockApi", { rawData: true })(
  "users:getAll", {}
)
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
            With <code className="rounded bg-muted px-1 py-0.5 text-xs">rawData: true</code>, the
            return type wraps data in a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">MethodKyResponse</code> object
            with status and headers. Without it, you get the data directly.
          </p>
        </ExampleBlock>
      </div>
    </>
  )
}
