import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const fileStructureCode = `src/
├── api/
│   ├── index.ts          # Request classes + sources export
│   ├── users.ts          # Users RequestGroup
│   ├── posts.ts          # Posts RequestGroup
│   └── files.ts          # Files RequestGroup
├── lib/
│   ├── request.ts        # createQueryRequest (proxy + React Query)
│   └── direct-request.ts # createDirectRequest (server-side)
├── app/
│   ├── api/
│   │   └── request/
│   │       └── route.ts  # apiRoute handler
│   ├── layout.tsx
│   └── page.tsx
└── ...`

const sourcesCode = `// api/index.ts
import { Request } from "@noverax/nexus/RequestClass"
import { Users } from "./users"
import { Posts } from "./posts"
import { Files } from "./files"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

const groups = {
  users: new Users(),
  posts: new Posts(),
  files: new Files(),
}

class MyApi extends Request<typeof groups> {
  constructor() {
    super({ baseURL: API_URL, groups })
  }
}

export const sources = { myApi: new MyApi() }
export type Sources = typeof sources`

const groupCode = `// api/users.ts
import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string; email: string }

export class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Method<User[]> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
  create: Method<User, { name: string; email: string }> = ({ post }) => post()
  update: Method<User, { id: number; name: string }> = ({ put }) => put(":id")
  remove: Method<null, { id: number }> = ({ del }) => del(":id")
}`

const proxyClientCode = `// lib/request.ts
import { createQueryRequest } from "@noverax/nexus/query"
import type { Sources } from "@/api"

export const { useQuery, useMutation, request } = createQueryRequest<Sources>()`

const directClientCode = `// lib/direct-request.ts
import { createDirectRequest } from "@noverax/nexus/direct"
import { sources } from "@/api"

export const directRequest = createDirectRequest(sources)`

const routeCode = `// app/api/request/route.ts
import { apiRoute } from "@noverax/nexus/next/apiRoute"
import { sources } from "@/api"

export const { POST } = apiRoute(sources)`

const multiSourceCode = `// api/index.ts
import { Request } from "@noverax/nexus/RequestClass"
import { Users } from "./users"
import { Products } from "./products"

const groups = { users: new Users() }
const productGroups = { products: new Products() }

class MainApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL ?? "http://localhost:4000",
      groups,
    })
  }
}

class PaymentApi extends Request<typeof productGroups> {
  constructor() {
    super({
      baseURL: process.env.PAYMENT_API_URL ?? "http://localhost:5000",
      groups: productGroups,
    })
  }
}

export const sources = {
  mainApi: new MainApi(),
  paymentApi: new PaymentApi(),
}

export type Sources = typeof sources`

const multiSourceUsageCode = `// Fully typed — TypeScript knows which groups belong to which source
const { data: users } = useQuery("mainApi", "users:getAll")
const { data: products } = useQuery("paymentApi", "products:list")`

const envCode = `# .env.local
API_URL=http://localhost:4000

# Multiple backends
PAYMENT_API_URL=http://localhost:5000

# Optional: custom proxy route path
# NEXT_PUBLIC_REQUEST_PAGE=api/my-proxy`

export const metadata = docsMetadata(
  "Project Setup",
  "Recommended file structure, patterns, and configuration for production apps."
)

export default async function ProjectSetupPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Project Setup"
        description="Recommended file structure, patterns, and configuration for production apps."
      />

      <Prose>
        <h2 id="file-structure">Recommended file structure</h2>

        <p>
          Keep your API definitions separate from your UI code. A typical Nexus project follows this
          structure:
        </p>
      </Prose>

      <CodeBlock code={fileStructureCode} language="bash" />

      <Prose>
        <h2 id="source-definitions">Source definitions</h2>

        <p>
          The <InlineCode>api/</InlineCode> directory contains your API structure. The main file
          creates <InlineCode>Request</InlineCode> instances with groups, and each group lives in
          its own file:
        </p>
      </Prose>

      <CodeBlock code={sourcesCode} filename="api/index.ts" />
      <CodeBlock code={groupCode} filename="api/users.ts" />

      <Callout variant="tip" title="One group per file">
        <p>
          Keeping each <InlineCode>RequestGroup</InlineCode> in its own file makes it easy to find
          and modify endpoints. The types stay co-located with the methods that use them.
        </p>
      </Callout>

      <Prose>
        <h2 id="client-setup">Client setup files</h2>

        <p>
          Create two files in <InlineCode>lib/</InlineCode> — one for proxy mode (client components)
          and one for direct mode (server components):
        </p>
      </Prose>

      <CodeBlock code={proxyClientCode} filename="lib/request.ts" />
      <CodeBlock code={directClientCode} filename="lib/direct-request.ts" />

      <Prose>
        <p>And the API route handler that the proxy client sends requests through:</p>
      </Prose>

      <CodeBlock code={routeCode} filename="app/api/request/route.ts" />

      <Prose>
        <h2 id="multiple-backends">Multiple backends</h2>

        <p>
          If your app talks to multiple backend services, create a separate{" "}
          <InlineCode>Request</InlineCode> class for each one. They can all be passed to the same
          sources object:
        </p>
      </Prose>

      <CodeBlock code={multiSourceCode} filename="api/index.ts" />

      <Prose>
        <p>
          Both sources share the same proxy route and direct client. TypeScript enforces that you
          use the correct group names for each source:
        </p>
      </Prose>

      <CodeBlock code={multiSourceUsageCode} />

      <Prose>
        <h2 id="environment-variables">Environment variables</h2>

        <p>
          Backend URLs should always be server-side environment variables (no{" "}
          <InlineCode>NEXT_PUBLIC_</InlineCode> prefix). The proxy route keeps them hidden from the
          browser:
        </p>
      </Prose>

      <CodeBlock code={envCode} language="bash" filename=".env.local" />

      <Callout variant="warning" title="Never expose API_URL to the client">
        <p>
          In proxy mode, the browser only talks to <InlineCode>/api/request</InlineCode>. Your
          backend URL, API keys, and other secrets stay on the server.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next steps</h2>

        <ul>
          <li>
            <Link href="/docs/examples/basic">Examples</Link> — interactive demos of every feature
          </li>
          <li>
            <Link href="/docs/introduction">What is Nexus?</Link> — architecture overview and
            comparison
          </li>
        </ul>
      </Prose>
    </div>
  )
}
