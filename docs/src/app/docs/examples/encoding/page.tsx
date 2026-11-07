import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { ExamplePage } from "@/site/sandbox/example-page"
import { ExampleSection } from "@/site/sandbox/example-section"

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

  // Merged into every call's variables: a write's body, a read's query
  defaultBody: { apiVersion: "v2" },
  // Merged into every call's query string, a write's too
  defaultQueryParams: { format: "json" },
})`

const bodyEncodingCode = `// Default (api): JSON body
await caller.echo.send({ name: "John", role: "admin" })
// POST /echo
// Content-Type: application/json
// Body: {"name":"John","role":"admin"}

// Custom (encodedApi): URL-encoded body + defaultBody merged
await encodedCaller.echo.send({ name: "John", role: "admin" })
// POST /echo?format=json
// Content-Type: application/x-www-form-urlencoded;charset=UTF-8
// Body: apiVersion=v2&name=John&role=admin`

const searchParamsCode = `// Custom searchParamsSerializer supports arrays
await encodedCaller.echo.retrieve({
  tags: ["javascript", "react"],
  page: 1,
})
// GET /echo?format=json&apiVersion=v2&tags%5B%5D=javascript&tags%5B%5D=react&page=1
// — tags[]=javascript&tags[]=react, its brackets encoded`

const defaultsCode = `// A write: defaultBody in its body, defaultQueryParams in its query
await encodedCaller.echo.send({ name: "John" })
// POST /echo?format=json
// Body: apiVersion=v2&name=John

// A read: both in its query, as a read's variables are
await encodedCaller.echo.retrieve({ page: 1 })
// GET /echo?format=json&apiVersion=v2&page=1`

export const metadata = exampleMetadata("encoding")

export default function EncodingExamplesPage() {
  return (
    <ExamplePage name="encoding">
      <ExampleSection
        title="Source Configuration"
        description="Configure encoding options on the defineApi call. These apply to all endpoints in the source."
        code={sourceConfigCode}
        learnMore={{ href: "/docs/advanced/encoding", label: "Encoding docs" }}
      >
        <p className="m-0 text-body text-fg-muted">
          The source above configures custom body encoding, search params encoding, and default
          values. See the demos below for interactive examples.
        </p>
      </ExampleSection>

      <ExampleSection
        title="Body Encoding"
        description="Compare JSON (default) vs URL-encoded body. Both send the same data to the echo endpoint, which answers with the type and the bytes it was sent: rawBody."
        code={bodyEncodingCode}
      >
        <BodyEncodingDemo />
      </ExampleSection>

      <ExampleSection
        title="Search Params Encoding"
        description="Custom encoder supports arrays. Arrays are encoded as key[]=val1&key[]=val2."
        code={searchParamsCode}
      >
        <SearchParamsDemo />
      </ExampleSection>

      <ExampleSection
        title="Default Data & Query Params"
        description="defaultBody merges into a write's body and a read's query, as a read's variables go; defaultQueryParams into every call's query string. The requests below show each address the site's server asked the API for, and the echo answers with the bytes it got."
        code={defaultsCode}
      >
        <DefaultsDemo />
      </ExampleSection>
    </ExamplePage>
  )
}
