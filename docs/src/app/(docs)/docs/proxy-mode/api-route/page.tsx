import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { StepList } from "@/components/docs/step-list"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { apiRoute } from "@noverax/nexus/next/apiRoute"

const { POST } = apiRoute(sources)
// sources: Record<string, Datasource<...>>
// POST: (request: NextRequest) => Promise<NextResponse>`

const setupCode = `// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus/next/apiRoute"
import { sources } from "@/api"

export const { POST } = apiRoute(sources)`

const sourcesCode = `// api/index.ts
import { Datasource, EndpointGroup, Endpoint } from "@noverax/nexus/datasource"

class Users extends EndpointGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Endpoint<User[]> = ({ get }) => get()
  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id")
}

class Posts extends EndpointGroup {
  constructor() {
    super({ prefix: "posts" })
  }

  list: Endpoint<Post[]> = ({ get }) => get()
  create: Endpoint<Post, { title: string }> = ({ post }) => post()
}

const groups = { users: new Users(), posts: new Posts() }

class MyApi extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
    })
  }
}

export const sources = { myApi: new MyApi() }
export type Sources = typeof sources`

const originCheckCode = `// Built-in origin validation
const origin = request.headers.get("origin")

if (!origin || new URL(request.url).origin !== origin) {
  return NextResponse.json(
    { success: false, message: "Origin mismatch" },
    { status: 403 }
  )
}

// Examples:
// ✓ origin: "https://myapp.com"  → request URL: "https://myapp.com/api/request"
// ✗ origin: "https://evil.com"   → request URL: "https://myapp.com/api/request"
// ✗ origin: null (no header)     → rejected`

const contentTypeCode = `// The API route handles two content types:

// 1. application/json — standard requests
// Body: { source, group, query, variables, options }

// 2. multipart/form-data — file uploads
// Fields: _source, _group, _query, _options + user data/files

// Anything else returns 415 Unsupported Media Type
// { success: false, message: "Unsupported Content-Type" }`

const cookieCode = `// api/index.ts — cookies are forwarded automatically
class MyApi extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // Browser cookies (e.g., session tokens) are forwarded
      // to the backend via the header whitelist.
      // set-cookie headers from the backend are passed
      // back to the browser in the proxy response.
    })
  }
}

// Browser side — credentials: "include" is the default
const request = createClientRequest<Sources>()
// Cookies are sent with every request automatically`

const errorHandlingCode = `// Error responses follow a consistent format:

// HTTP errors from the backend:
// Status: forwarded from backend (e.g., 404, 422, 500)
// Body:   parsed JSON from backend response

// Validation errors (missing source, method not found):
// Status: 400
// Body:   { success: false, message: "[myApi][users][getById]: method not found" }

// Origin mismatch:
// Status: 403
// Body:   { success: false, message: "Origin mismatch" }

// Invalid JSON body:
// Status: 400
// Body:   { success: false, message: "Invalid JSON body" }

// 204 responses from backend:
// Status: 204
// Body:   null (empty response)`

const customPathCode = `// If you need a custom proxy path:

// 1. Move the route file
//    app/api/my-proxy/route.ts

// 2. Set the environment variable
//    NEXT_PUBLIC_REQUEST_PAGE=my-proxy

// 3. The route file content stays the same
import { apiRoute } from "@noverax/nexus/next/apiRoute"
import { sources } from "@/api"

export const { POST } = apiRoute(sources)`

export const metadata = docsMetadata(
  "API Route Handler",
  "The server-side endpoint that receives proxy requests and forwards them to your backend."
)

export default async function ApiRoutePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="API Route Handler"
        description="The server-side endpoint that receives proxy requests and forwards them to your backend."
      />

      <Prose>
        <h2 id="overview">Overview</h2>

        <p>
          <InlineCode>apiRoute</InlineCode> creates a Next.js App Router POST handler that acts as
          the server-side half of proxy mode. It receives requests from{" "}
          <InlineCode>createClientRequest</InlineCode>, validates them, and forwards them to your
          backend via <InlineCode>createRequest</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} language="typescript" />

      <Prose>
        <h2 id="setup">Setup</h2>

        <p>
          Create a route handler file and export the <InlineCode>POST</InlineCode> method. This is
          the only file needed on the server side:
        </p>
      </Prose>

      <StepList
        steps={[
          {
            title: "Define your sources",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  The sources object maps source names to <InlineCode>Datasource</InlineCode>{" "}
                  instances. Each source can have multiple groups with typed methods:
                </p>
                <CodeBlock code={sourcesCode} filename="api/index.ts" />
              </div>
            ),
          },
          {
            title: "Create the route handler",
            content: (
              <div className="mt-4 space-y-4">
                <p>
                  Pass your sources to <InlineCode>apiRoute</InlineCode> and export the{" "}
                  <InlineCode>POST</InlineCode> handler:
                </p>
                <CodeBlock code={setupCode} filename="app/api/request/route.ts" />
                <Callout variant="tip" title="That&apos;s it">
                  <p>
                    This two-line file is all you need. The handler automatically validates origins,
                    parses payloads, routes to the correct method, and returns the response.
                  </p>
                </Callout>
              </div>
            ),
          },
        ]}
      />

      <Prose>
        <h2 id="origin-validation">Origin validation</h2>

        <p>
          Every request is checked to ensure the <InlineCode>Origin</InlineCode> header matches the
          request URL origin. This prevents cross-site request forgery and unauthorized third-party
          access:
        </p>
      </Prose>

      <CodeBlock code={originCheckCode} language="typescript" />

      <Prose>
        <h2 id="content-type">Content-Type handling</h2>

        <p>The API route accepts two content types and rejects everything else:</p>
      </Prose>

      <CodeBlock code={contentTypeCode} language="typescript" />

      <Prose>
        <h2 id="cookie-forwarding">Cookie forwarding</h2>

        <p>
          Cookies are forwarded in both directions automatically. Browser cookies are included in
          the proxied request (via the header whitelist), and <InlineCode>set-cookie</InlineCode>{" "}
          headers from the backend are passed through to the browser response:
        </p>
      </Prose>

      <CodeBlock code={cookieCode} language="typescript" />

      <Callout variant="info" title="set-cookie handling">
        <p>
          Nexus uses <InlineCode>getSetCookie()</InlineCode> to correctly handle multiple{" "}
          <InlineCode>set-cookie</InlineCode> headers, avoiding the common bug of splitting cookie
          values on commas.
        </p>
      </Callout>

      <Prose>
        <h2 id="error-responses">Error responses</h2>

        <p>
          The API route returns consistent JSON error responses with appropriate HTTP status codes.
          Backend errors are forwarded with their original status:
        </p>
      </Prose>

      <CodeBlock code={errorHandlingCode} language="typescript" />

      <Prose>
        <h2 id="custom-path">Custom proxy path</h2>

        <p>
          The default proxy endpoint is <InlineCode>/api/request</InlineCode>. To use a different
          path, move the route file and update the environment variable:
        </p>
      </Prose>

      <CodeBlock code={customPathCode} filename="app/api/my-proxy/route.ts" />

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — configure the
            browser-side client
          </li>
          <li>
            <Link href="/docs/proxy-mode/path-params">Path Parameters</Link> — dynamic URL segments
          </li>
          <li>
            <Link href="/docs/proxy-mode/encoding">Encoding</Link> — custom body and query
            serialization
          </li>
        </ul>
      </Prose>
    </div>
  )
}
