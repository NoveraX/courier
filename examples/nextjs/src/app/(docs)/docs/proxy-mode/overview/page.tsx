import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const architectureCode = `┌──────────────────────────────────────────────────────────────┐
│  Browser (Client Component)                                  │
│                                                              │
│  createClientRequest<Sources>()                              │
│       │                                                      │
│       ▼                                                      │
│  ky.post("/api/request", { json: { source, group, query } }) │
└──────────────────┬───────────────────────────────────────────┘
                   │  POST /api/request
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js API Route (Server)                                  │
│                                                              │
│  apiRoute(sources) → { POST }                                │
│       │  ✓ origin validation                                 │
│       │  ✓ cookie forwarding                                 │
│       │  ✓ header whitelisting                               │
│       ▼                                                      │
│  createRequest(sources, body, context)                        │
│       │                                                      │
│       ▼                                                      │
│  Instance → ky → GET/POST/PUT/PATCH/DELETE                   │
└──────────────────┬───────────────────────────────────────────┘
                   │  HTTP request
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend API (any REST server)                               │
│  e.g. Express, FastAPI, Rails, Go                            │
└──────────────────────────────────────────────────────────────┘`

const flowCode = `// 1. Browser — call a typed request
const request = createClientRequest<Sources>()
const user = await request("myApi")("users:getById", { id: 5 })

// 2. Under the hood, Nexus sends:
//    POST /api/request
//    { source: "myApi", group: "users", query: "getById", variables: { id: 5 } }

// 3. API route receives the POST, finds the source and method,
//    creates an Instance, and calls: GET {baseURL}/users/5

// 4. Response flows back: backend → API route → browser`

const securityCode = `// src/next/apiRoute.ts — built-in origin check
const origin = request.headers.get("origin")

if (!origin || new URL(request.url).origin !== origin) {
  return NextResponse.json(
    { success: false, message: "Origin mismatch" },
    { status: 403 }
  )
}`

const headersCode = `// Only these headers are forwarded from the browser to the backend:
const whitelistedHeaders = [
  "referer",
  "origin",
  "authorization",
  "user-agent",
  "cookie",
  "x-forwarded-for",
  "x-forwarded",
  "x-real-ip",
  "x-request-id",
  // ... plus custom headers via extraHeaders option
]`

const comparisonCode = `// Proxy mode — browser cannot see API_URL or secrets
// Browser → POST /api/request → Server → GET https://internal-api.company.com/users
const request = createClientRequest<Sources>()
const users = await request("myApi")("users:getAll")

// Direct mode — server calls backend directly, no proxy hop
// Server → GET https://internal-api.company.com/users
const users = await directRequest("myApi")("users:getAll")`

export default async function ProxyModeOverviewPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Proxy Mode Overview"
        description="How Nexus routes browser requests through your Next.js server to keep secrets hidden and bypass CORS."
      />

      <Prose>
        <h2 id="what-is-proxy-mode">What is proxy mode?</h2>

        <p>
          In proxy mode, browser requests never reach your backend directly. Instead, every request
          goes through a Next.js API route that acts as a reverse proxy:
        </p>

        <ol>
          <li>
            The browser calls <InlineCode>createClientRequest</InlineCode>, which POSTs to{" "}
            <InlineCode>/api/request</InlineCode>
          </li>
          <li>
            The API route (<InlineCode>apiRoute</InlineCode>) validates the origin, parses the
            payload, and calls <InlineCode>createRequest</InlineCode>
          </li>
          <li>
            <InlineCode>createRequest</InlineCode> looks up the source, group, and method, creates
            an <InlineCode>Instance</InlineCode>, and makes the real HTTP call to your backend
          </li>
          <li>The response is forwarded back to the browser</li>
        </ol>
      </Prose>

      <CodeBlock code={architectureCode} language="bash" filename="Architecture" />

      <Prose>
        <h2 id="why-use-proxy">Why use proxy mode?</h2>

        <ul>
          <li>
            <strong>Hide API secrets</strong> — your backend URL, API keys, and tokens stay on the
            server. The browser only sees <InlineCode>/api/request</InlineCode>.
          </li>
          <li>
            <strong>Bypass CORS</strong> — the proxy route runs on the same origin as your frontend,
            so there are no cross-origin restrictions.
          </li>
          <li>
            <strong>Forward cookies</strong> — credentials are included automatically (
            <InlineCode>credentials: &quot;include&quot;</InlineCode> by default), and{" "}
            <InlineCode>set-cookie</InlineCode> headers from the backend are passed through.
          </li>
          <li>
            <strong>Centralized error handling</strong> — the API route catches errors and returns
            consistent JSON responses with proper HTTP status codes.
          </li>
          <li>
            <strong>Request/response hooks</strong> — use <InlineCode>onRequest</InlineCode>,{" "}
            <InlineCode>onResponse</InlineCode>, and <InlineCode>onError</InlineCode> hooks at the
            source level to transform, log, or enrich every request.
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="request-flow">Request flow</h2>

        <p>Here is the complete flow from a browser call to the backend response:</p>
      </Prose>

      <CodeBlock code={flowCode} filename="Request lifecycle" />

      <Prose>
        <h2 id="security">Security</h2>

        <p>
          Proxy mode includes two built-in security layers: origin validation and header
          whitelisting.
        </p>

        <h3 id="origin-validation">Origin validation</h3>

        <p>
          The API route rejects requests whose <InlineCode>Origin</InlineCode> header does not match
          the request URL origin. This prevents third-party sites from calling your proxy:
        </p>
      </Prose>

      <CodeBlock code={securityCode} language="typescript" />

      <Prose>
        <h3 id="header-whitelisting">Header whitelisting</h3>

        <p>
          Not all browser headers are forwarded to the backend. Nexus uses a whitelist to prevent
          leaking internal headers while passing through the ones your backend needs:
        </p>
      </Prose>

      <CodeBlock code={headersCode} language="typescript" />

      <Callout variant="tip" title="Custom headers">
        <p>
          Need additional headers forwarded? Use the <InlineCode>extraHeaders</InlineCode> option in
          your <InlineCode>Request</InlineCode> class constructor to extend the whitelist.
        </p>
      </Callout>

      <Prose>
        <h2 id="proxy-vs-direct">When to use proxy vs direct mode</h2>

        <p>
          Use <strong>proxy mode</strong> for client components where the browser initiates the
          request. Use <strong>direct mode</strong> for server components and server actions where
          the server calls the backend directly with zero overhead.
        </p>
      </Prose>

      <CodeBlock code={comparisonCode} filename="Comparison" />

      <Callout variant="info" title="Same API definitions">
        <p>
          Both modes share the same <InlineCode>Request</InlineCode> and{" "}
          <InlineCode>RequestGroup</InlineCode> classes. You define your API once and use it from
          both client and server code with full type safety.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/client-request">createClientRequest</Link> — set up the
            browser-side proxy client
          </li>
          <li>
            <Link href="/docs/proxy-mode/api-route">API Route Handler</Link> — configure the
            server-side proxy endpoint
          </li>
          <li>
            <Link href="/docs/proxy-mode/path-params">Path Parameters</Link> — dynamic URL segments
            with <InlineCode>:param</InlineCode> syntax
          </li>
        </ul>
      </Prose>
    </div>
  )
}
