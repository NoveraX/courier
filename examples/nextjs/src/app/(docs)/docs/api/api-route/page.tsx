import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const signatureCode = `import { apiRoute } from "@noverax/nexus/next"

export const { POST } = apiRoute(sources)`

const sourcesTypeCode = `type Sources = Record<string, Request<AnyGroups | undefined>>`

const returnTypeCode = `{
  POST: (request: NextRequest) => Promise<Response | NextResponse>
}`

const basicUsageCode = `// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus/next"
import { sources } from "@/api/sources"

export const { POST } = apiRoute(sources)`

const sourcesExampleCode = `// api/sources.ts
import { Request, RequestGroup } from "@noverax/nexus/classes"

const api = new Request({
  baseURL: process.env.API_URL,
  timeout: 10000,
  headers: {
    Authorization: \`Bearer \${process.env.API_SECRET}\`,
  },
  groups: {
    users: new RequestGroup({ prefix: "/users" }),
    posts: new RequestGroup({ prefix: "/posts" }),
  },
})

export const sources = { api } as const
export type Sources = typeof sources`

const customRouteCode = `// You can place the route at any path:
// app/api/nexus/route.ts     → /api/nexus
// app/api/v1/proxy/route.ts  → /api/v1/proxy

// Then configure the client to match:
const request = createClientRequest<Sources>({
  requestPage: "nexus",  // matches /api/nexus
})`

const requestFlowCode = `// What happens when apiRoute receives a request:
//
// 1. Validate Origin header (CSRF protection)
//    → 403 if origin doesn't match request URL
//
// 2. Parse Content-Type
//    → multipart/form-data: parse as FormData (file uploads)
//    → application/json: parse as JSON
//    → other: 415 Unsupported Content-Type
//
// 3. Extract request params from body:
//    JSON:     { source, group, query, variables, options }
//    FormData: _source, _group, _query, _options fields + file fields
//
// 4. Call createRequest(sources, body, context)
//    → Resolves source → creates Instance → executes method
//
// 5. Return response to the client`

const jsonBodyCode = `// JSON request body structure (sent by createClientRequest)
{
  "source": "api",
  "group": "users",
  "query": "getById",
  "variables": { "id": "123" },
  "options": { "timeout": 5000 }
}`

const formDataBodyCode = `// FormData request structure (file uploads)
// Fields prefixed with _ are Nexus metadata:
_source:  "api"
_group:   "files"
_query:   "upload"
_options: '{"timeout":30000}'
file:     <File>           // actual file data
name:     "document.pdf"   // additional variables`

const errorResponsesCode = `// Error responses returned by apiRoute:

// 403 — Origin mismatch (CSRF protection)
{ "success": false, "message": "Origin mismatch" }

// 400 — Invalid JSON body
{ "success": false, "message": "Invalid JSON body" }

// 415 — Unsupported Content-Type
{ "success": false, "message": "Unsupported Content-Type" }`

export const metadata = docsMetadata("apiRoute", "Creates a Next.js App Router POST handler that processes proxy-mode requests from createClientRequest.")

export default async function ApiRoutePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="apiRoute"
        description="Creates a Next.js App Router POST handler that processes proxy-mode requests from createClientRequest."
        badge="Server"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock code={`import { apiRoute } from "@noverax/nexus/next"`} language="typescript" />

      <Prose>
        <h2 id="signature">Signature</h2>
        <p>
          <InlineCode>apiRoute</InlineCode> takes your source definitions and returns an object with
          a <InlineCode>POST</InlineCode> handler — ready to be exported from a Next.js route file.
        </p>
      </Prose>

      <CodeBlock code={signatureCode} language="typescript" />

      <Prose>
        <h2 id="parameters">Parameters</h2>
        <h3 id="sources">sources</h3>
        <p>
          A record mapping source names to <InlineCode>Request</InlineCode> instances. Each source
          defines its <InlineCode>baseURL</InlineCode>, headers, groups, and methods.
        </p>
      </Prose>

      <CodeBlock code={sourcesTypeCode} language="typescript" />

      <Prose>
        <h2 id="return-type">Return Type</h2>
      </Prose>

      <CodeBlock code={returnTypeCode} language="typescript" />

      <Prose>
        <h2 id="usage">Basic Usage</h2>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="app/api/request/route.ts" />

      <Prose>
        <h2 id="sources-example">Defining Sources</h2>
        <p>
          Sources are shared between <InlineCode>apiRoute</InlineCode> (server) and your type
          definitions (client). Define them once, export the type for{" "}
          <InlineCode>createClientRequest</InlineCode>.
        </p>
      </Prose>

      <CodeBlock code={sourcesExampleCode} filename="api/sources.ts" />

      <Callout variant="tip" title="Secret safety">
        <p>
          Environment variables without the <InlineCode>NEXT_PUBLIC_</InlineCode> prefix (like{" "}
          <InlineCode>API_SECRET</InlineCode>) are only available server-side. The proxy pattern
          keeps your secrets safe — the client never sees the <InlineCode>baseURL</InlineCode> or{" "}
          <InlineCode>Authorization</InlineCode> header.
        </p>
      </Callout>

      <Prose>
        <h2 id="custom-route">Custom Route Path</h2>
        <p>
          The route file location determines the API path. Match it with{" "}
          <InlineCode>requestPage</InlineCode> in your client config.
        </p>
      </Prose>

      <CodeBlock code={customRouteCode} language="typescript" />

      <Prose>
        <h2 id="request-flow">Request Flow</h2>
        <p>
          When <InlineCode>apiRoute</InlineCode> receives a POST request, it performs these steps:
        </p>
      </Prose>

      <CodeBlock code={requestFlowCode} language="bash" filename="Request Flow" />

      <Prose>
        <h2 id="request-body">Request Body Format</h2>
        <h3 id="json-body">JSON Body</h3>
        <p>
          Standard requests send a JSON body with source, group, query, variables, and options.
        </p>
      </Prose>

      <CodeBlock code={jsonBodyCode} language="json" />

      <Prose>
        <h3 id="formdata-body">FormData Body</h3>
        <p>
          File uploads send a <InlineCode>multipart/form-data</InlineCode> body with Nexus metadata
          in prefixed fields.
        </p>
      </Prose>

      <CodeBlock code={formDataBodyCode} language="bash" />

      <Prose>
        <h2 id="security">Security</h2>
        <h3 id="origin-validation">Origin Validation</h3>
        <p>
          The handler validates the <InlineCode>Origin</InlineCode> header against the request URL.
          If they don&apos;t match, a <InlineCode>403</InlineCode> is returned. This prevents
          cross-site request forgery (CSRF) attacks.
        </p>
      </Prose>

      <Callout variant="warning" title="Same-origin only">
        <p>
          The <InlineCode>apiRoute</InlineCode> handler only accepts requests from the same origin.
          Cross-origin requests are rejected with a 403 status.
        </p>
      </Callout>

      <Prose>
        <h2 id="error-responses">Error Responses</h2>
      </Prose>

      <CodeBlock code={errorResponsesCode} language="json" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode Overview</Link> — understand the
            proxy architecture
          </li>
          <li>
            <Link href="/docs/proxy-mode/api-route">API Route Guide</Link> — step-by-step setup
          </li>
          <li>
            <Link href="/docs/api/create-client-request">createClientRequest</Link> — the client
            that sends requests to apiRoute
          </li>
          <li>
            <Link href="/docs/api/request">Request</Link> — defining data sources
          </li>
        </ul>
      </Prose>
    </div>
  )
}
