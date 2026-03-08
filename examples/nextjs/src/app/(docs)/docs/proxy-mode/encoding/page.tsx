import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const defaultBehaviorCode = `// Default encoding behavior depends on the HTTP method:

// GET, DELETE → variables go to URLSearchParams
// GET /users?page=1&limit=10
getAll: Method<User[], { page: number; limit: number }> = ({ get }) => get()
await request("myApi")("users:getAll", { page: 1, limit: 10 })

// POST, PUT, PATCH → variables go to JSON body
// POST /users  Body: { "name": "Jane", "email": "jane@test.com" }
create: Method<User, { name: string; email: string }> = ({ post }) => post()
await request("myApi")("users:create", { name: "Jane", email: "jane@test.com" })

// HEAD → no variables sent
check: Method<void> = ({ head }) => head()`

const bodyEncoderCode = `import { Request } from "@noverax/nexus/RequestClass"

const groups = { auth: new Auth() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Custom body serialization — e.g., x-www-form-urlencoded
      bodyEncoder: (data) => {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(data)) {
          params.append(key, String(value))
        }
        return params
      },
    })
  }
}

// POST /auth/token
// Content-Type: application/x-www-form-urlencoded
// Body: grant_type=password&username=jane&password=secret
await request("myApi")("auth:login", {
  grant_type: "password",
  username: "jane",
  password: "secret",
})`

const searchParamsEncoderCode = `import { Request } from "@noverax/nexus/RequestClass"

const groups = { products: new Products() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Custom query string format — e.g., array params
      searchParamsEncoder: (data) => {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value)) {
            // tags[]=a&tags[]=b instead of tags=a,b
            for (const item of value) {
              params.append(\`\${key}[]\`, String(item))
            }
          } else {
            params.append(key, String(value))
          }
        }
        return params
      },
    })
  }
}

// GET /products?category=electronics&tags[]=sale&tags[]=new
await request("myApi")("products:search", {
  category: "electronics",
  tags: ["sale", "new"],
})`

const searchParamsParseCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Parse query params from URL paths back to an object
      // Used when a method URL contains a query string: get("items?sort=asc")
      searchParamsParse: (queryString) => {
        const params = new URLSearchParams(queryString)
        const result: Record<string, unknown> = {}
        for (const [key, value] of params.entries()) {
          result[key] = value
        }
        return result
      },
    })
  }
}`

const defaultDataCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Merged into every request body (POST/PUT/PATCH)
      // and every query string (GET/DELETE)
      defaultData: {
        apiVersion: "v2",
        locale: "en",
      },
    })
  }
}

// POST /users  Body: { "apiVersion": "v2", "locale": "en", "name": "Jane" }
await request("myApi")("users:create", { name: "Jane" })

// GET /users?apiVersion=v2&locale=en&page=1
await request("myApi")("users:getAll", { page: 1 })`

const defaultQueryParamsCode = `class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Merged into query params for ALL methods (including POST)
      // Unlike defaultData, this only affects the URL query string
      defaultQueryParams: {
        api_key: "public-key-123",
      },
    })
  }
}

// GET /users?api_key=public-key-123&page=1
await request("myApi")("users:getAll", { page: 1 })

// POST /users?api_key=public-key-123  Body: { "name": "Jane" }
await request("myApi")("users:create", { name: "Jane" })`

const variableFlowCode = `// Complete variable flow:

// 1. Path params are extracted first (see Path Parameters page)
//    /users/:id + { id: 5, name: "Jane" } → URL: /users/5, remaining: { name: "Jane" }

// 2. defaultData is merged with remaining variables
//    defaultData: { locale: "en" }
//    merged: { locale: "en", name: "Jane" }

// 3. defaultQueryParams is merged into search params
//    defaultQueryParams: { api_key: "123" }

// 4. Method determines where merged variables go:
//    GET/DELETE  → URLSearchParams: /users/5?locale=en&name=Jane&api_key=123
//    POST/PUT   → JSON body: { locale: "en", name: "Jane" } + query: ?api_key=123`

export const metadata = docsMetadata("Encoding", "Control how request bodies and query parameters are serialized.")

export default async function EncodingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Encoding"
        description="Control how request bodies and query parameters are serialized."
      />

      <Prose>
        <h2 id="default-behavior">Default behavior</h2>

        <p>
          By default, Nexus serializes variables based on the HTTP method. GET and DELETE methods
          send variables as URL search params. POST, PUT, and PATCH send them as a JSON body:
        </p>
      </Prose>

      <CodeBlock code={defaultBehaviorCode} filename="Default encoding" />

      <Prose>
        <h2 id="body-encoder">bodyEncoder</h2>

        <p>
          Override the default JSON serialization for request bodies. This is useful when your
          backend expects a different format like{" "}
          <InlineCode>application/x-www-form-urlencoded</InlineCode>, Protocol Buffers, or any
          custom encoding:
        </p>
      </Prose>

      <CodeBlock code={bodyEncoderCode} filename="api/index.ts" />

      <Callout variant="info" title="Scope">
        <p>
          <InlineCode>bodyEncoder</InlineCode> is set at the source level and applies to all
          POST/PUT/PATCH requests for that source. If you need different encoding per group, create
          separate <InlineCode>Request</InlineCode> sources.
        </p>
      </Callout>

      <Prose>
        <h2 id="search-params-encoder">searchParamsEncoder</h2>

        <p>
          Override how query parameters are serialized. The default behavior converts each key-value
          pair to a simple <InlineCode>key=value</InlineCode> string. Use a custom encoder for array
          params, nested objects, or other formats:
        </p>
      </Prose>

      <CodeBlock code={searchParamsEncoderCode} filename="api/index.ts" />

      <Prose>
        <h2 id="search-params-parse">searchParamsParse</h2>

        <p>
          When a method URL contains a query string (e.g.,{" "}
          <InlineCode>{`get("items?sort=asc")`}</InlineCode>), Nexus parses it into an object and
          merges it with the caller&apos;s variables. Use <InlineCode>searchParamsParse</InlineCode>{" "}
          to customize this parsing:
        </p>
      </Prose>

      <CodeBlock code={searchParamsParseCode} filename="api/index.ts" />

      <Prose>
        <h2 id="default-data">defaultData</h2>

        <p>
          Provide default values that are merged into every request. For GET/DELETE, they become
          query params. For POST/PUT/PATCH, they are merged into the JSON body. Caller variables
          override defaults with the same key:
        </p>
      </Prose>

      <CodeBlock code={defaultDataCode} filename="api/index.ts" />

      <Prose>
        <h2 id="default-query-params">defaultQueryParams</h2>

        <p>
          Unlike <InlineCode>defaultData</InlineCode>, which goes to the body for POST requests,{" "}
          <InlineCode>defaultQueryParams</InlineCode> always goes to the URL query string regardless
          of HTTP method:
        </p>
      </Prose>

      <CodeBlock code={defaultQueryParamsCode} filename="api/index.ts" />

      <Callout variant="tip" title="When to use which">
        <p>
          Use <InlineCode>defaultData</InlineCode> for values that should be part of the request
          payload (body or query depending on method). Use{" "}
          <InlineCode>defaultQueryParams</InlineCode> for values that must always appear in the URL,
          like API keys or version identifiers.
        </p>
      </Callout>

      <Prose>
        <h2 id="variable-flow">Complete variable flow</h2>

        <p>
          Understanding the order of operations helps when combining path params, defaults, and
          caller variables:
        </p>
      </Prose>

      <CodeBlock code={variableFlowCode} language="typescript" />

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/path-params">Path Parameters</Link> — dynamic URL segments
            extracted from variables
          </li>
          <li>
            <Link href="/docs/proxy-mode/upload">File Upload</Link> — FormData-based uploads with
            progress
          </li>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — browser-side
            proxy setup
          </li>
        </ul>
      </Prose>
    </div>
  )
}
