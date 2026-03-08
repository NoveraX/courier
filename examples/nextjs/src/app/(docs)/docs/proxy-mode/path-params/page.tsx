import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { InlineCode } from "@/components/docs/inline-code"
import { Prose } from "@/components/docs/prose"
import { PageHeader } from "@/components/layout/page-header"

const basicCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type User = { id: number; name: string }
type Comment = { id: number; body: string }

class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" })
  }

  // GET /users/:id → compiled to GET /users/5
  getById: Method<User, { id: number }> = ({ get }) => get(":id")

  // GET /users/:userId/posts/:postId/comments/:commentId
  getComment: Method<Comment, {
    userId: number
    postId: number
    commentId: number
  }> = ({ get }) => get(":userId/posts/:postId/comments/:commentId")
}`

const variablesCode = `// Path params are extracted from the variables object.
// Remaining variables go to query params (GET) or body (POST).

// GET /users/5 — { id: 5 } consumed by :id
await request("myApi")("users:getById", { id: 5 })

// GET /users/5?include=posts — { id: 5 } consumed by :id, { include: "posts" } → query param
getWithDetails: Method<User, { id: number; include?: string }> = ({ get }) => get(":id")
await request("myApi")("users:getWithDetails", { id: 5, include: "posts" })

// POST /users/5/avatar — { id: 5 } consumed by :id, { name: "photo.jpg" } → JSON body
updateAvatar: Method<void, { id: number; name: string }> = ({ post }) => post(":id/avatar")
await request("myApi")("users:updateAvatar", { id: 5, name: "photo.jpg" })`

const pathOptionsCode = `import { Request, RequestGroup, Method } from "@noverax/nexus/RequestClass"
import { cookies } from "next/headers"

type User = { id: number; name: string }

class Users extends RequestGroup {
  constructor() {
    super({ prefix: "orgs/:orgId/users" })
  }

  getAll: Method<User[]> = ({ get }) => get()
  getById: Method<User, { id: number }> = ({ get }) => get(":id")
}

const groups = { users: new Users() }

class MyApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: process.env.API_URL,
      groups,
      // pathOptions provides values for path params that come from context,
      // not from the caller's variables
      pathOptions: async (req) => {
        const cookieStore = await cookies()
        const orgId = cookieStore.get("orgId")?.value
        return { orgId }
      },
    })
  }
}

// Now every request automatically includes :orgId from the cookie:
// GET /orgs/42/users       — orgId from pathOptions
// GET /orgs/42/users/5     — orgId from pathOptions, id from variables`

const groupPathOptionsCode = `import { type Method, RequestGroup } from "@noverax/nexus/RequestClass"

type Project = { id: number; name: string }
type Task = { id: number; title: string }

class Projects extends RequestGroup {
  constructor() {
    super({
      prefix: "workspaces/:workspaceId/projects",
      // Group-level pathOptions override source-level pathOptions
      pathOptions: async (req) => {
        // For this group, workspaceId comes from a header
        const workspaceId = req?.headers.get("x-workspace-id")
        return { workspaceId }
      },
    })
  }

  getAll: Method<Project[]> = ({ get }) => get()
  getById: Method<Project, { id: number }> = ({ get }) => get(":id")
}

class Tasks extends RequestGroup {
  constructor() {
    super({ prefix: "tasks" })
    // No group pathOptions — uses the source-level pathOptions if any
  }

  getAll: Method<Task[]> = ({ get }) => get()
}`

const variableConsumptionCode = `// The flow of variables through path compilation:

// 1. pathOptions() is called → returns { orgId: "42" }
// 2. variables from the caller are merged: { orgId: "42", id: 5, include: "posts" }
// 3. Path ":orgId/users/:id" consumes orgId and id
// 4. Remaining { include: "posts" } goes to query params (GET) or body (POST)
// 5. Final URL: GET /orgs/42/users/5?include=posts

// Group pathOptions override source pathOptions for the same key:
// Source pathOptions:  { orgId: "42" }
// Group pathOptions:   { orgId: "99" }
// Result:              { orgId: "99" }  ← group wins`

const cachingCode = `// Path compilation functions are cached for performance.
// The first call to compile("/users/:id") creates and caches the function.
// Subsequent calls reuse the cached function.

// This means paths like "/users/:id" are compiled once,
// no matter how many times they are called with different variables.`

export default async function PathParamsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Path Parameters"
        description="Dynamic URL segments using :param syntax, compiled via path-to-regexp."
      />

      <Prose>
        <h2 id="basic-syntax">Basic syntax</h2>

        <p>
          Use the <InlineCode>:paramName</InlineCode> syntax in URL paths to define dynamic
          segments. Nexus compiles these paths using <InlineCode>path-to-regexp</InlineCode> and
          substitutes values from variables or <InlineCode>pathOptions</InlineCode>:
        </p>
      </Prose>

      <CodeBlock code={basicCode} filename="api/users.ts" />

      <Prose>
        <h2 id="variables-as-path-params">Variables as path params</h2>

        <p>
          When you pass variables to a request, Nexus first extracts any values that match path
          parameter names. The remaining variables are sent as query parameters (for GET/DELETE) or
          as the request body (for POST/PUT/PATCH):
        </p>
      </Prose>

      <CodeBlock code={variablesCode} filename="Variable consumption" />

      <Callout variant="tip" title="Automatic extraction">
        <p>
          You do not need to separate path params from body/query params manually. Nexus handles
          this automatically based on the path definition. Just pass all variables in a single
          object.
        </p>
      </Callout>

      <Prose>
        <h2 id="path-options">pathOptions function</h2>

        <p>
          For path parameters that come from server-side context (cookies, headers, session) rather
          than the caller, use the <InlineCode>pathOptions</InlineCode> function. It runs on the
          server before every request and provides values for path compilation:
        </p>
      </Prose>

      <CodeBlock code={pathOptionsCode} filename="api/index.ts" />

      <Callout variant="info" title="Server-side only">
        <p>
          The <InlineCode>pathOptions</InlineCode> function receives the{" "}
          <InlineCode>NextRequest</InlineCode> object and runs on the server inside the API route.
          It has access to cookies, headers, and any server-side context.
        </p>
      </Callout>

      <Prose>
        <h2 id="group-path-options">Group-level pathOptions</h2>

        <p>
          Each <InlineCode>RequestGroup</InlineCode> can define its own{" "}
          <InlineCode>pathOptions</InlineCode> that override the source-level values for the same
          keys. This is useful when different groups resolve the same parameter differently:
        </p>
      </Prose>

      <CodeBlock code={groupPathOptionsCode} filename="api/groups.ts" />

      <Prose>
        <h2 id="variable-consumption">How variables flow</h2>

        <p>
          Understanding how variables are consumed is important. Here is the complete resolution
          order:
        </p>

        <ol>
          <li>
            Source-level <InlineCode>pathOptions(request)</InlineCode> is called
          </li>
          <li>
            Group-level <InlineCode>pathOptions(request)</InlineCode> is called (overrides source
            values)
          </li>
          <li>Caller&apos;s variables are merged (overrides pathOptions for matching keys)</li>
          <li>Path parameters are extracted and consumed</li>
          <li>Remaining variables go to query params or body</li>
        </ol>
      </Prose>

      <CodeBlock code={variableConsumptionCode} language="typescript" />

      <Prose>
        <h2 id="caching">Path compilation caching</h2>

        <p>
          Nexus caches compiled path functions for performance. Each unique path string is compiled
          once and reused across all subsequent requests:
        </p>
      </Prose>

      <CodeBlock code={cachingCode} language="typescript" />

      <Callout variant="warning" title="Missing path params">
        <p>
          If a required path parameter is not provided by either{" "}
          <InlineCode>pathOptions</InlineCode> or variables, the request will throw an{" "}
          <InlineCode>HTTPError</InlineCode> with status 400 and a descriptive message from{" "}
          <InlineCode>path-to-regexp</InlineCode>.
        </p>
      </Callout>

      <Prose>
        <h2 id="next-steps">Next Steps</h2>

        <ul>
          <li>
            <Link href="/docs/proxy-mode/encoding">Encoding</Link> — custom body and query
            serialization
          </li>
          <li>
            <Link href="/docs/proxy-mode/upload">File Upload</Link> — upload files with progress
            tracking
          </li>
          <li>
            <Link href="/docs/proxy-mode/api-route">API Route Handler</Link> — how the server
            processes proxy requests
          </li>
        </ul>
      </Prose>
    </div>
  )
}
