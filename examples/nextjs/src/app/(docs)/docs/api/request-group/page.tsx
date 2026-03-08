import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"
import { docsMetadata } from "@/lib/metadata"

const classCode = `class RequestGroup {
  constructor(public options?: RequestGroupOptions)
}`

const optionsCode = `type RequestGroupOptions = MergeOptions & {
  prefix?: string
}

type MergeOptions = {
  pathOptions?: PathOptions
}

type PathOptions = (
  request?: NextRequest,
) => PathOptionsResult | Promise<PathOptionsResult>

type PathOptionsResult =
  | Record<string, boolean | number | string | null | undefined>
  | undefined`

const basicUsageCode = `import { Request, RequestGroup } from "@noverax/nexus/classes"

const api = new Request({
  baseURL: process.env.API_URL,
  groups: {
    users: new RequestGroup({ prefix: "/users" }),
    posts: new RequestGroup({ prefix: "/posts" }),
    auth: new RequestGroup({ prefix: "/auth" }),
  },
})

// Calling "users:getAll" → GET {baseURL}/users
// Calling "posts:getById" → GET {baseURL}/posts/:id`

const prefixCode = `// The prefix is prepended to all method URLs within this group
const usersGroup = new RequestGroup({ prefix: "/api/v2/users" })

// Method URL: "/:id"      → /api/v2/users/:id
// Method URL: "/search"   → /api/v2/users/search
// Method URL: ""          → /api/v2/users`

const pathOptionsCode = `import { RequestGroup } from "@noverax/nexus/classes"

// pathOptions dynamically injects URL parameters
const tenantGroup = new RequestGroup({
  prefix: "/:tenantId/users",
  pathOptions: async (req) => {
    // req is the NextRequest object (available in proxy mode)
    const tenantId = req?.headers.get("x-tenant-id") || "default"
    return { tenantId }
  },
})

// When tenantId = "acme":
// Method URL: ""       → /acme/users
// Method URL: "/:id"   → /acme/users/:id`

const multiLevelCode = `const api = new Request({
  baseURL: process.env.API_URL,
  // pathOptions at Request level apply to ALL groups
  pathOptions: async (req) => ({
    version: "v2",
  }),
  groups: {
    users: new RequestGroup({
      prefix: "/:version/users",
      // pathOptions at group level are merged with Request-level
      pathOptions: async (req) => ({
        tenantId: req?.headers.get("x-tenant-id"),
      }),
    }),
  },
})

// Both :version and :tenantId are resolved:
// "users:getAll" → /v2/users (version from Request pathOptions)`

const queryFormatCode = `// Query format with groups: "group:method"
await request("api")("users:getAll")
await request("api")("users:getById", { id: "123" })

// Query format without groups: "method"
await request("api")("health")`

export const metadata = docsMetadata(
  "RequestGroup",
  "Class that groups related methods under a namespace with a shared URL prefix and optional dynamic path parameters."
)

export default async function RequestGroupPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="RequestGroup"
        description="Class that groups related methods under a namespace with a shared URL prefix and optional dynamic path parameters."
        badge="Class"
      />

      <Prose>
        <h2 id="import">Import</h2>
      </Prose>

      <CodeBlock
        code={`import { RequestGroup } from "@noverax/nexus/classes"`}
        language="typescript"
      />

      <Prose>
        <h2 id="signature">Signature</h2>
      </Prose>

      <CodeBlock code={classCode} language="typescript" />

      <Prose>
        <h2 id="options">RequestGroupOptions</h2>
      </Prose>

      <CodeBlock code={optionsCode} language="typescript" />

      <Prose>
        <ul>
          <li>
            <InlineCode>prefix</InlineCode> — URL path prefix prepended to all method URLs in this
            group. Supports <InlineCode>:param</InlineCode> placeholders resolved by{" "}
            <InlineCode>pathOptions</InlineCode>.
          </li>
          <li>
            <InlineCode>pathOptions</InlineCode> — async function that returns dynamic URL
            parameters. Receives the <InlineCode>NextRequest</InlineCode> object in proxy mode.
            Values are substituted into <InlineCode>:param</InlineCode> placeholders in the prefix
            and method URLs.
          </li>
        </ul>
      </Prose>

      <Prose>
        <h2 id="basic-usage">Basic Usage</h2>
      </Prose>

      <CodeBlock code={basicUsageCode} filename="api/sources.ts" />

      <Prose>
        <h2 id="prefix">Prefix</h2>
        <p>
          The prefix is prepended to all method URLs within the group. It forms the base path for
          the group&apos;s endpoints.
        </p>
      </Prose>

      <CodeBlock code={prefixCode} language="typescript" />

      <Prose>
        <h2 id="path-options">Dynamic Path Options</h2>
        <p>
          <InlineCode>pathOptions</InlineCode> is a function that returns key-value pairs for URL
          parameter substitution. Any <InlineCode>:param</InlineCode> in the prefix or method URL is
          replaced with the corresponding value.
        </p>
      </Prose>

      <CodeBlock code={pathOptionsCode} filename="api/sources.ts" />

      <Callout variant="info" title="Path resolution order">
        <p>
          Path options from the <InlineCode>Request</InlineCode> level are resolved first, then
          group-level <InlineCode>pathOptions</InlineCode> are merged on top. Group options take
          precedence for overlapping keys.
        </p>
      </Callout>

      <Prose>
        <h2 id="multi-level">Multi-Level Path Options</h2>
        <p>
          Path options can be defined at both the <InlineCode>Request</InlineCode> and{" "}
          <InlineCode>RequestGroup</InlineCode> level. They are merged together.
        </p>
      </Prose>

      <CodeBlock code={multiLevelCode} language="typescript" />

      <Prose>
        <h2 id="query-format">Query Format</h2>
        <p>
          When calling methods in a group, use the <InlineCode>&quot;group:method&quot;</InlineCode>{" "}
          format. Root-level methods (no group) use just the method name.
        </p>
      </Prose>

      <CodeBlock code={queryFormatCode} language="typescript" />

      <Prose>
        <h2 id="related">Related</h2>
        <ul>
          <li>
            <Link href="/docs/api/request">Request</Link> — parent class that holds groups
          </li>
          <li>
            <Link href="/docs/core-concepts/request">Request & RequestGroup Guide</Link> — in-depth
            usage patterns
          </li>
          <li>
            <Link href="/docs/proxy-mode/path-params">Path Parameters</Link> — detailed path
            parameter guide
          </li>
          <li>
            <Link href="/docs/api/instance">Instance</Link> — the HTTP client that executes group
            methods
          </li>
        </ul>
      </Prose>
    </div>
  )
}
