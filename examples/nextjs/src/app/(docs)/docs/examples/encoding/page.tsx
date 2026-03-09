import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { BodyEncodingDemo, DefaultsDemo, SearchParamsDemo } from "./_components"

const sourceConfigCode = `import { Datasource } from "@noverax/nexus/datasource"

class EncodedApi extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: "http://localhost:4000",
      groups: { echo: new Echo() },

      // Sends URL-encoded body instead of JSON
      bodyEncoder: (data) =>
        new URLSearchParams(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),

      // Encodes arrays as key[]=val1&key[]=val2
      searchParamsEncoder: (params) => {
        const sp = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            for (const item of value)
              sp.append(\`\${key}[]\`, String(item))
          } else {
            sp.append(key, String(value))
          }
        }
        return sp
      },

      // Auto-merged into every POST/PUT/PATCH body
      defaultData: { apiVersion: "v2" },
      // Auto-merged into every GET/DELETE query string
      defaultQueryParams: { format: "json" },
    })
  }
}`

const bodyEncodingCode = `// Default (mockApi): JSON body
await request("mockApi")("echo:send", { name: "John", role: "admin" })
// Content-Type: application/json
// Body: { "name": "John", "role": "admin" }

// Custom (encodedApi): URL-encoded body + defaultData merged
await request("encodedApi")("echo:send", { name: "John", role: "admin" })
// Content-Type: application/x-www-form-urlencoded
// Body: apiVersion=v2&name=John&role=admin`

const searchParamsCode = `// Custom searchParamsEncoder supports arrays
await request("encodedApi")("echo:retrieve", {
  tags: ["javascript", "react"],
  page: 1,
})
// GET /echo?format=json&apiVersion=v2&tags[]=javascript&tags[]=react&page=1`

const defaultsCode = `// defaultData auto-merges into POST body
await request("encodedApi")("echo:send", { name: "John" })
// Body includes: apiVersion=v2&name=John

// defaultQueryParams auto-merges into GET query
await request("encodedApi")("echo:retrieve", { page: 1 })
// Query includes: format=json&page=1`

export const metadata = docsMetadata(
  "Encoding",
  "Custom body and search params encoding with default values."
)

export default function EncodingExamplesPage() {
  return (
    <>
      <PageHeader
        title="Encoding"
        description="Custom body and search params encoding with default values."
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Source Configuration"
          description="Configure encoding options on the Datasource class. These apply to all methods in the source."
          code={sourceConfigCode}
          learnMoreHref="/docs/proxy-mode/encoding"
          learnMoreLabel="Encoding docs"
        >
          <p className="text-sm text-muted-foreground">
            The source above configures custom body encoding, search params encoding, and default
            values. See the demos below for interactive examples.
          </p>
        </ExampleBlock>

        <ExampleBlock
          title="Body Encoding"
          description="Compare JSON (default) vs URL-encoded body. Both send the same data to the echo endpoint."
          code={bodyEncodingCode}
        >
          <BodyEncodingDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Search Params Encoding"
          description="Custom encoder supports arrays. Arrays are encoded as key[]=val1&key[]=val2."
          code={searchParamsCode}
        >
          <SearchParamsDemo />
        </ExampleBlock>

        <ExampleBlock
          title="Default Data & Query Params"
          description="defaultData merges into POST body. defaultQueryParams merges into GET query string."
          code={defaultsCode}
        >
          <DefaultsDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
