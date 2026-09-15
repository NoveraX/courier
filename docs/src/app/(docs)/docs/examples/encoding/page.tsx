import { ExampleBlock } from "@/components/docs/example-block"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

import { BodyEncodingDemo, DefaultsDemo, SearchParamsDemo } from "./_components"

const sourceConfigCode = `import { defineApi } from "@noverax/courier/define"

const encodedApi = defineApi({
  baseURL: "http://localhost:4000",
  groups: { echo },

  // Sends URL-encoded body instead of JSON
  bodySerializer: (data) =>
    new URLSearchParams(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),

  // Encodes arrays as key[]=val1&key[]=val2
  searchParamsSerializer: {
    stringify: (params) => {
      const sp = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const item of value)
            sp.append(\`\${key}[]\`, String(item))
        } else {
          sp.append(key, String(value))
        }
      }
      return sp.toString()
    },
    parse: (str) =>
      Object.fromEntries(new URLSearchParams(str).entries()),
  },

  // Auto-merged into every POST/PUT/PATCH body
  defaultBody: { apiVersion: "v2" },
  // Auto-merged into every GET/DELETE query string
  defaultQueryParams: { format: "json" },
})`

const bodyEncodingCode = `// Default (api): JSON body
await caller.echo.send({ name: "John", role: "admin" })
// Content-Type: application/json
// Body: { "name": "John", "role": "admin" }

// Custom (encodedApi): URL-encoded body + defaultBody merged
await encodedCaller.echo.send({ name: "John", role: "admin" })
// Content-Type: application/x-www-form-urlencoded
// Body: apiVersion=v2&name=John&role=admin`

const searchParamsCode = `// Custom searchParamsSerializer supports arrays
await encodedCaller.echo.retrieve({
  tags: ["javascript", "react"],
  page: 1,
})
// GET /echo?format=json&apiVersion=v2&tags[]=javascript&tags[]=react&page=1`

const defaultsCode = `// defaultBody auto-merges into POST body
await encodedCaller.echo.send({ name: "John" })
// Body includes: apiVersion=v2&name=John

// defaultQueryParams auto-merges into GET query
await encodedCaller.echo.retrieve({ page: 1 })
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
        mode="both"
      />

      <div className="space-y-8">
        <ExampleBlock
          title="Source Configuration"
          description="Configure encoding options on the defineApi call. These apply to all endpoints in the source."
          code={sourceConfigCode}
          learnMoreHref="/docs/advanced/encoding"
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
          description="defaultBody merges into POST body. defaultQueryParams merges into GET query string."
          code={defaultsCode}
        >
          <DefaultsDemo />
        </ExampleBlock>
      </div>
    </>
  )
}
