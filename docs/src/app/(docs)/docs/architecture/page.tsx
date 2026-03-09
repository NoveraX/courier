import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const proxyFlowCode = `┌──────────────────────────────────────────────────────────────┐
│  Browser (Client Component)                                  │
│                                                              │
│  createClientRequest<Sources>()                              │
│       │                                                      │
│       ▼                                                      │
│  ky.post("/api/request", {                                   │
│    json: { source, group, query, variables }                 │
│  })                                                          │
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
│  createRequest(sources, body, context)                       │
│       │                                                      │
│       ▼                                                      │
│  HttpClient → ky → GET/POST/PUT/PATCH/DELETE                   │
└──────────────────┬───────────────────────────────────────────┘
                   │  HTTP request
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend API (any REST server)                               │
└──────────────────────────────────────────────────────────────┘`

const directFlowCode = `┌──────────────────────────────────────────────────────────────┐
│  Next.js Server (RSC / Server Action / API Route)            │
│                                                              │
│  createDirectRequest(sources)                                │
│       │                                                      │
│       ▼                                                      │
│  createRequest(sources, body, context)                       │
│       │                                                      │
│       ▼                                                      │
│  HttpClient → ky → GET/POST/PUT/PATCH/DELETE                   │
└──────────────────┬───────────────────────────────────────────┘
                   │  HTTP request
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend API (any REST server)                               │
└──────────────────────────────────────────────────────────────┘`

const sourcesCode = `import { Datasource, EndpointGroup, type Endpoint } from "@noverax/nexus/datasource"

type User = { id: number; name: string; email: string }

// EndpointGroup — groups related endpoints under a URL prefix
class Users extends EndpointGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Endpoint<User[]> = ({ get }) => get()
  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id")
  create: Endpoint<User, { name: string; email: string }> = ({ post }) => post()
}

// Datasource — top-level source with baseURL and groups
class MyApi extends Datasource<{ users: Users }> {
  constructor() {
    super({
      baseURL: process.env.API_URL!,
      groups: { users: new Users() },
    })
  }
}

// Sources object — passed to apiRoute, createDirectRequest, createRequest
export const sources = { myApi: new MyApi() }
export type Sources = typeof sources`

const createRequestCode = `// createRequest is the single core orchestrator
// Both proxy and direct modes call it with the same interface

createRequest(sources, {
  source: "myApi",       // which Datasource class
  group: "users",        // which EndpointGroup
  query: "getById",      // which Endpoint
  variables: { id: 5 },  // typed variables
}, context)

// Internally:
// 1. Looks up sources["myApi"] → MyApi instance
// 2. Finds the group: myApi.groups["users"] → Users instance
// 3. Creates an HttpClient with baseURL + prefix → "https://api.example.com/users"
// 4. Calls the method: users.getById({ get, post, ... })
// 5. The method calls get(":id") → HttpClient resolves to GET /users/5
// 6. Returns the parsed JSON response`

const instanceCode = `// HttpClient wraps ky and generates typed HTTP methods
// It handles: URL params, body encoding, search params, AbortController

const instance = new HttpClient({
  baseURL: "https://api.example.com/users",
  variables: { id: 5 },
  headers: { Authorization: "Bearer ..." },
})

// instance.createMethods provides:
// { get, post, put, patch, del, head }

// Each method resolves :param placeholders from variables
// get(":id") → GET /users/5
// post() with variables → POST /users with JSON body`

const layersCode = `// Layer 1 — API Definition (shared)
class MyApi extends Datasource<{ users: Users }> { ... }
export const sources = { myApi: new MyApi() }

// Layer 2 — Transport (mode-specific)
// Proxy:  createClientRequest → ky.post("/api/request") → apiRoute → createRequest
// Direct: createDirectRequest → createRequest

// Layer 3 — Execution (shared)
// createRequest → HttpClient → ky → backend

// Layer 4 — Integration (optional)
// createQueryRequest wraps createClientRequest with React Query hooks`

export const metadata = docsMetadata(
  "Architecture",
  "How Nexus works under the hood — request flow, core components, and the two transport modes."
)

export default async function ArchitecturePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Architecture"
        description="How Nexus works under the hood — request flow, core components, and the two transport modes."
      />

      <Prose>
        <p>
          Nexus is built around a simple idea: define your API once and access it from anywhere in
          your Next.js app. The architecture has four layers — definition, transport, execution, and
          integration — that work together to keep your code type-safe and DRY.
        </p>

        <h2 id="four-layers">The Four Layers</h2>
      </Prose>

      <CodeBlock code={layersCode} language="typescript" filename="Architecture layers" />

      <Prose>
        <ol>
          <li>
            <strong>Definition</strong> — <InlineCode>Datasource</InlineCode> and{" "}
            <InlineCode>EndpointGroup</InlineCode> classes define your API structure, base URLs,
            methods, and types. This layer is shared between all modes.
          </li>
          <li>
            <strong>Transport</strong> — determines <em>how</em> the request reaches the server.
            Proxy mode goes through an API route; direct mode calls the backend immediately.
          </li>
          <li>
            <strong>Execution</strong> — <InlineCode>createRequest</InlineCode> is the single
            orchestrator that resolves source → group → method and delegates to{" "}
            <InlineCode>HttpClient</InlineCode> for the actual HTTP call.
          </li>
          <li>
            <strong>Integration</strong> — optional wrappers like{" "}
            <InlineCode>createQueryRequest</InlineCode> that add React Query hooks on top of the
            transport layer.
          </li>
        </ol>

        <h2 id="proxy-mode-flow">Proxy Mode Flow</h2>

        <p>
          In proxy mode, the browser never talks to your backend directly. Requests go through a
          Next.js API route that acts as a reverse proxy:
        </p>
      </Prose>

      <CodeBlock code={proxyFlowCode} language="bash" filename="Proxy mode" />

      <Prose>
        <p>Key steps in the proxy flow:</p>

        <ol>
          <li>
            <InlineCode>createClientRequest</InlineCode> serializes the method call (source, group,
            query, variables) into a JSON payload
          </li>
          <li>
            The payload is POSTed to <InlineCode>/api/request</InlineCode> via{" "}
            <InlineCode>ky</InlineCode>
          </li>
          <li>
            <InlineCode>apiRoute</InlineCode> validates the origin, extracts whitelisted headers and
            cookies, then calls <InlineCode>createRequest</InlineCode>
          </li>
          <li>
            <InlineCode>createRequest</InlineCode> resolves the source, group, and method, creates
            an <InlineCode>HttpClient</InlineCode>, and executes the HTTP call
          </li>
          <li>The response flows back: backend → API route → browser</li>
        </ol>
      </Prose>

      <Callout variant="info" title="Security built in">
        <p>
          Proxy mode validates the <InlineCode>Origin</InlineCode> header, whitelists forwarded
          headers, and keeps your backend URL and API keys server-side. The browser only sees{" "}
          <InlineCode>/api/request</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="direct-mode-flow">Direct Mode Flow</h2>

        <p>
          In direct mode, server-side code (RSC, Server Actions, API Routes) calls the backend with
          no intermediate HTTP hop:
        </p>
      </Prose>

      <CodeBlock code={directFlowCode} language="bash" filename="Direct mode" />

      <Prose>
        <p>
          Direct mode skips the API route entirely. <InlineCode>createDirectRequest</InlineCode>{" "}
          calls <InlineCode>createRequest</InlineCode> directly, which creates an{" "}
          <InlineCode>HttpClient</InlineCode> and makes the HTTP call. This eliminates the extra
          network hop and keeps the entire operation server-side.
        </p>
      </Prose>

      <Prose>
        <h2 id="core-components">Core Components</h2>

        <h3 id="request-requestgroup">Datasource & EndpointGroup</h3>

        <p>
          These are the foundation of your API definition. A <InlineCode>Datasource</InlineCode> class
          represents a backend service with a <InlineCode>baseURL</InlineCode> and one or more{" "}
          <InlineCode>EndpointGroup</InlineCode> instances. Each group represents a REST resource
          (e.g., users, products) with typed methods.
        </p>
      </Prose>

      <CodeBlock code={sourcesCode} filename="api/sources.ts" />

      <Prose>
        <h3 id="create-request">createRequest</h3>

        <p>
          The core orchestrator. Both proxy and direct modes converge here.{" "}
          <InlineCode>createRequest</InlineCode> receives the sources, a body describing which
          method to call, and an optional context (headers for cookie forwarding):
        </p>
      </Prose>

      <CodeBlock code={createRequestCode} language="typescript" filename="Core orchestration" />

      <Prose>
        <h3 id="instance">HttpClient</h3>

        <p>
          <InlineCode>HttpClient</InlineCode> wraps <InlineCode>ky</InlineCode> and provides typed
          HTTP methods. It resolves path parameters from variables, encodes request bodies, and
          manages abort controllers:
        </p>
      </Prose>

      <CodeBlock code={instanceCode} language="typescript" filename="HttpClient" />

      <Callout variant="tip" title="ky under the hood">
        <p>
          Nexus uses <InlineCode>ky</InlineCode> as the HTTP engine — a lightweight, modern{" "}
          <InlineCode>fetch</InlineCode> wrapper with retry, timeout, hooks, and JSON handling built
          in. You never interact with <InlineCode>ky</InlineCode> directly; Nexus configures it
          through <InlineCode>HttpClient</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="factories">Factory Functions</h2>

        <p>
          Nexus provides three factory functions, each wrapping{" "}
          <InlineCode>createRequest</InlineCode> for a specific use case:
        </p>
      </Prose>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-semibold">Factory</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Environment</th>
              <th className="px-4 py-3 font-semibold">Returns</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">
                <InlineCode>createClientRequest</InlineCode>
              </td>
              <td className="px-4 py-3">Proxy</td>
              <td className="px-4 py-3">Browser</td>
              <td className="px-4 py-3">
                <InlineCode>{"RequestFn<Sources>"}</InlineCode>
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-foreground">
                <InlineCode>createDirectRequest</InlineCode>
              </td>
              <td className="px-4 py-3">Direct</td>
              <td className="px-4 py-3">Server</td>
              <td className="px-4 py-3">
                <InlineCode>{"RequestFn<Sources>"}</InlineCode>
              </td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-medium text-foreground">
                <InlineCode>createQueryRequest</InlineCode>
              </td>
              <td className="px-4 py-3">Proxy</td>
              <td className="px-4 py-3">Browser</td>
              <td className="px-4 py-3">
                <InlineCode>{"{ useQuery, useMutation, request }"}</InlineCode>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Prose>
        <p>
          All three return the same <InlineCode>{"RequestFn<Sources>"}</InlineCode> type (or
          wrap it), meaning you get identical type inference regardless of which factory you use.
        </p>

        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/installation">Installation</Link> — add Nexus to your project
          </li>
          <li>
            <Link href="/docs/core-concepts/request">Datasource & EndpointGroup</Link> — deep dive into
            API definitions
          </li>
          <li>
            <Link href="/docs/proxy-mode/overview">Proxy Mode</Link> — browser-to-backend request
            flow
          </li>
          <li>
            <Link href="/docs/server-side/overview">Direct Mode</Link> — server-side data fetching
          </li>
        </ul>
      </Prose>
    </div>
  )
}
